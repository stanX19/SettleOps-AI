import sys

import requests
from requests import Response
import threading
import json
import time
import socket
import subprocess
import re

# Thread-safe printing
print_lock = threading.Lock()

# ANSI color codes for better readability
class Colors:
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    CYAN = '\033[96m'
    MAGENTA = '\033[95m'
    END = '\033[0m'
    BOLD = '\033[1m'


class ThreadFilter:
    _main_threads = []
    _log_file = None
    _log_path = "backend.log"

    def write(self, msg):
        try:
            curr = threading.current_thread()
        except (AttributeError, OSError):
            return
        if ThreadFilter._main_threads and curr in ThreadFilter._main_threads:
            sys.__stdout__.write(msg)
        elif ThreadFilter._log_file:
            ThreadFilter._log_file.write(msg)
            ThreadFilter._log_file.flush()

    def flush(self):
        try:
            sys.__stdout__.flush()
        except Exception:
            pass

    def isatty(self):
        return sys.__stdout__.isatty()

    @staticmethod
    def redirect_all_other():
        # Ensure stdout can handle UTF-8 characters on Windows
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
            sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")
        except Exception:
            pass

        try:
            current_thread = threading.current_thread()
        except (AttributeError, OSError):
            return

        if current_thread in ThreadFilter._main_threads:
            return
        ThreadFilter._main_threads.append(current_thread)
        if ThreadFilter._log_file is None:
            ThreadFilter._log_file = open(ThreadFilter._log_path, "w+", encoding="utf-8")
            sys.stdout = ThreadFilter()
            sys.stderr = ThreadFilter()

    @staticmethod
    def set_log_path(log_path: str):
        if ThreadFilter._log_file:
            raise Exception("Log file already open")
        ThreadFilter._log_path = log_path

class TestClient:
    thread_colors = [Colors.CYAN, Colors.MAGENTA, Colors.YELLOW]
    thread_dict = {}

    def __init__(self, base_url: str, actor_name: str = "Main"):
        self.base_url = base_url.rstrip('/')
        self.actor_name = actor_name
        self.headers = {}
        ThreadFilter.redirect_all_other()

    @staticmethod
    def _get_safe_payload(payload: dict):
        safe_payload = {}
        for k, v in payload.items():
            if isinstance(v, dict):
                safe_payload[k] = TestClient._get_safe_payload(v)
                continue

            str_rep = str(v)
            if len(str_rep) > 100:
                str_rep = str_rep[:100] + "..."
            safe_payload[k] = str_rep
        return safe_payload
        

    @staticmethod
    def log(actor, method, direction, description, status, payload=None):
        """
        Unified logging format:
        [Thread] [Method] [Direction] Description (Status) [Payload]
        """
        # Color coding
        if actor not in TestClient.thread_dict:
            TestClient.thread_dict[actor] = TestClient.thread_colors.pop(0)
            TestClient.thread_colors.append(TestClient.thread_dict[actor])
        thread_color = TestClient.thread_dict[actor]
        method_color = Colors.BLUE
        direction_color = Colors.GREEN if direction == "SEND" else Colors.YELLOW
        status_color = Colors.GREEN if status in ["OK", "SUCCESS", "CONNECTING", "CONNECTED"] else Colors.RED if status in ["KO", "FAILED", "DISCONNECTED"] else Colors.YELLOW

        status_str = f"({status_color}{status}{Colors.END})"
        payload_str = ""

        if payload:
            if isinstance(payload, dict):
                # Show summarized payload for dicts
                safe_payload = TestClient._get_safe_payload(payload)

                payload_str = f" {Colors.BOLD}{json.dumps(safe_payload)}{Colors.END}"
            else:
                payload_str = f" {Colors.BOLD}{payload}{Colors.END}"

        with print_lock:
            print(
                f"{thread_color}[{actor}]{Colors.END} {method_color}[{method}]{Colors.END} {direction_color}[{direction}]{Colors.END} {description} {status_str}{payload_str}")

    def check_status(self, res: Response, expected_status: int = 200) -> bool:
        if res.status_code != expected_status:
            # We print the error before exiting to make it visible why it failed
            # print(f"FAILED: {res.status_code} != {expected_status}\n{res.text}") # Removed explicit print
            return False
        return True

    @staticmethod
    def preflight_check(port: int, interactive: bool = True, auto_kill: bool = False):
        """Check if port is ready for a new server instance.

        Args:
            port: The port to check.
            interactive: Whether to prompt for action if port is busy.
            auto_kill: If true, automatically kill the process on the port.
        """
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex(('127.0.0.1', port)) != 0:
                # Port is free
                return True

        # Port is busy
        print(f"{Colors.YELLOW}{Colors.BOLD}[!] PORT COLLISION:{Colors.END} Port {port} is already in use.")
        
        # Guard: Only run netstat/taskkill on Windows
        if sys.platform != "win32":
            return True

        # Try to find PID
        pid = None
        try:
            output = subprocess.check_output(f'netstat -ano | findstr LISTENING | findstr :{port}', shell=True).decode()
            match = re.search(r'\s+(\d+)\s*$', output.strip())
            if match:
                pid = match.group(1)
        except Exception:
            pass

        pid_info = f" (PID: {pid})" if pid else ""
        if auto_kill and pid:
            print(f"{Colors.YELLOW}Auto-killing process{pid_info} on port {port}...{Colors.END}")
            subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
            time.sleep(1)
            return True

        if not interactive:
            print(f"{Colors.RED}ERROR: Cannot start server on port {port}{pid_info}.{Colors.END}")
            sys.exit(1)

        choice = input(f"{Colors.CYAN}A process{pid_info} is occupying the port. Kill it? [Y/n]: {Colors.END}")
        if choice.lower() in ['', 'y', 'yes']:
            if pid:
                print(f"Killing process {pid}...")
                subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
                time.sleep(1)
                return True
            else:
                print(f"{Colors.RED}Could not identify PID. Please kill the process manually.{Colors.END}")
                sys.exit(1)
        else:
            print(f"{Colors.RED}Aborting. Port {port} must be free to run tests.{Colors.END}")
            sys.exit(1)

    @staticmethod
    def wait_for_server(base_url: str, timeout: int = 30):
        """Poll the health endpoint until server is ready."""
        print(f"{Colors.BLUE}Waiting for server at {base_url}...{Colors.END}")
        start = time.time()
        while time.time() - start < timeout:
            try:
                res = requests.get(f"{base_url.rstrip('/')}/health", timeout=1)
                if res.status_code == 200:
                    print(f"{Colors.GREEN}Server is healthy!{Colors.END}")
                    return True
            except requests.exceptions.ConnectionError:
                pass
            time.sleep(0.5)
        
        print(f"{Colors.RED}ERROR: Server at {base_url} never became healthy after {timeout}s.{Colors.END}")
        sys.exit(1)

    def request(self, method: str, path: str, description: str = "", expected_status: int = 200, **kwargs) -> dict:
        url = f"{self.base_url}{path}"
        
        # Merge default headers
        if self.headers:
            headers = self.headers.copy()
            if "headers" in kwargs:
                headers.update(kwargs["headers"])
            kwargs["headers"] = headers

        # Log SEND
        TestClient.log(self.actor_name, method, "SEND", f"{description} ({path})", "PENDING", kwargs.get('json') or kwargs.get('params'))

        try:
            res = requests.request(method, url, **kwargs)
            
            # Extract data if available
            data = {}
            if res.content:
                try:
                    data = res.json()
                except ValueError:
                    # Not JSON
                    pass
            
            status_msg = "OK" if self.check_status(res, expected_status=expected_status) else "FAILED"
            
            # Log RECEIVE
            log_payload = data if data else (res.text[:100] if res.text else res.status_code)
            
            TestClient.log(self.actor_name, method, "RECEIVE", f"{description}", status_msg, log_payload)
            
            if status_msg == "FAILED":
                 print(f"{Colors.RED}FAILED DETAIL (Status {res.status_code} != {expected_status}):\n{res.text}{Colors.END}")

            return data
        except requests.exceptions.ConnectionError:
            TestClient.log(self.actor_name, method, "RECEIVE", f"{description}", "FAILED", "Connection Error")

    def post(self, path: str, description: str = "", **kwargs) -> dict:
        return self.request("POST", path, description=description, **kwargs)

    def get(self, path: str, description: str = "", **kwargs) -> dict:
        return self.request("GET", path, description=description, **kwargs)

class TestSocket:
    def __init__(self, url: str, actor_name: str, headers: dict | None = None):
        self.url = url
        self.actor_name = actor_name
        self.headers = headers or {}
        self.response = None
        self.events_received: list[dict] = []
        self.thread: threading.Thread | None = None

    def connect(self):
        TestClient.log(self.actor_name, "SSE", "SEND", "Connecting to stream", "CONNECTING")
        try:
            self.response = requests.get(self.url, stream=True, timeout=120, headers=self.headers)
            if self.response.status_code == 200:
                 TestClient.log(self.actor_name, "SSE", "RECEIVE", "Stream connected", "CONNECTED")
            else:
                 TestClient.log(self.actor_name, "SSE", "RECEIVE", f"Failed to connect: {self.response.status_code}", "FAILED")
        except Exception as e:
            TestClient.log(self.actor_name, "SSE", "RECEIVE", f"Stream connection error: {e}", "FAILED")

    def listen_in_foreground(self, until_event: str | None = None):
        ThreadFilter.redirect_all_other()
        if not self.response:
            return

        event_type = "Failed to decode"
        try:
            for line in self.response.iter_lines():
                if not line:
                    continue
                decoded = line.decode('utf-8')
                # print(f"DEBUG: [SSE RAW] {decoded}", flush=True)
                if decoded.startswith("event:"):
                    event_type = decoded.replace("event:", "").strip()
                    continue
                elif decoded.startswith("data:"):
                    try:
                        # Parse JSON strictly or fallback to string
                        data = json.loads(decoded.replace("data:", "").strip())
                        TestClient.log(self.actor_name, "SSE", "RECEIVE", f"Event: {event_type}", "OK", data)
                    except json.JSONDecodeError:
                        data = decoded.replace("data:", "").strip()
                        TestClient.log(self.actor_name, "SSE", "RECEIVE", f"Event: {event_type}", "OK", data)
                    
                    self.events_received.append({"event": event_type, "data": data})

                    if until_event and event_type == until_event:
                        break
        except Exception as e:
            TestClient.log(self.actor_name, "SSE", "RECEIVE", "Stream closed or error", "DISCONNECTED", str(e))
        finally:
            self.response.close()

    def listen(self, until_event: str | None = None) -> threading.Thread | None:
        """
        Listens to the SSE stream in a background thread.
        """
        if not self.response:
            return None

        self.thread = threading.Thread(target=self.listen_in_foreground, args=(until_event,), daemon=True)
        self.thread.start()
        return self.thread

    def join_listener(self, timeout: int | None = None):
        """
        Joins the listener thread.
        """
        if self.thread:
            self.thread.join(timeout=timeout)


