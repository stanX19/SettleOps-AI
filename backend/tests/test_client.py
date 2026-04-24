import sys

import requests
from requests import Response
import threading
import json
import time

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
        if ThreadFilter._main_threads and threading.current_thread() in ThreadFilter._main_threads:
            sys.__stdout__.write(msg)
        else:
            ThreadFilter._log_file.write(msg)
            ThreadFilter._log_file.flush()

    def flush(self):
        sys.__stdout__.flush()

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

        current_thread = threading.current_thread()
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

    def request(self, method: str, path: str, description: str = "", **kwargs) -> dict:
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
            
            status_msg = "OK" if self.check_status(res) else "FAILED"
            
            # Log RECEIVE
            # Use data if available, otherwise res.text if short, else status code
            log_payload = data if data else (res.text[:100] if res.text else res.status_code)
            
            TestClient.log(self.actor_name, method, "RECEIVE", f"{description}", status_msg, log_payload)
            
            if status_msg == "FAILED":
                 print(f"{Colors.RED}FAILED DETAIL:\n{res.text}{Colors.END}")

            return data
        except requests.exceptions.ConnectionError:
            TestClient.log(self.actor_name, method, "RECEIVE", f"{description}", "FAILED", "Connection Error")

    def post(self, path: str, description: str = "", **kwargs) -> dict:
        return self.request("POST", path, description=description, **kwargs)

    def get(self, path: str, description: str = "", **kwargs) -> dict:
        return self.request("GET", path, description=description, **kwargs)

class TestSocket:
    def __init__(self, url: str, actor_name: str):
        self.url = url
        self.actor_name = actor_name
        self.response = None
        self.events_received: list[dict] = []
        self.thread: threading.Thread | None = None

    def connect(self):
        TestClient.log(self.actor_name, "SSE", "SEND", "Connecting to stream", "CONNECTING")
        try:
            self.response = requests.get(self.url, stream=True, timeout=120)
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


