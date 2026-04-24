"""Automated tests for Phase 1 routes: health, auth, topics, chat.

Run: ``python -m tests.test`` from the backend root.

Chatbot.ask is monkey-patched so no LLM keys or network calls are needed.
"""
import time
import threading

import requests
import uvicorn

from tests.test_client import TestClient, Colors, ThreadFilter, TestSocket

ThreadFilter.redirect_all_other()

# ---------------------------------------------------------------------------
# Monkey-patch chatbot.ask BEFORE importing main so the agent never fires.
# ---------------------------------------------------------------------------

_last_ask_kwargs: dict = {}


async def _mock_ask(
    self,
    user_prompt: str,
    document_text: str | None = None,
    chat_history=None,
    on_tool_call=None,
) -> str:
    _last_ask_kwargs.clear()
    _last_ask_kwargs["user_prompt"] = user_prompt
    _last_ask_kwargs["document_text"] = document_text
    _last_ask_kwargs["chat_history"] = chat_history
    _last_ask_kwargs["on_tool_call"] = on_tool_call
    return f"Mock reply to: {user_prompt}"


import srcs.services.agents.chatbot as _chatbot_mod
_chatbot_mod.Chatbot.ask = _mock_ask


async def _mock_transcribe_audio(audio_data: bytes, language_code: str | None = None) -> str | None:
    """Mock transcription to avoid ElevenLabs API calls during testing."""
    return "Mock transcribed text"

import srcs.services.speech_service as _speech_mod
_speech_mod.SpeechService.transcribe_audio = staticmethod(_mock_transcribe_audio)

from main import app


def start_server():
    """Start uvicorn in a daemon thread."""
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="error")


def run_tests():
    print(f"{Colors.BLUE}Starting Server (port 8001)...{Colors.END}")
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    time.sleep(2)
    start_time = time.time()

    base_url = "http://127.0.0.1:8001"
    client = TestClient(base_url, actor_name="Tester")

    print(f"\n{Colors.BOLD}=== RUNNING PHASE 1 UNIT TESTS ==={Colors.END}\n")

    try:
        # -- 1. Health Check ----------------------------------------------
        print(f"\n{Colors.BOLD}--- 1. Health Check ---{Colors.END}")
        res = client.get("/health", description="Health probe")
        assert res == {"status": "healthy"}, f"Expected healthy, got {res}"

        # -- 2. Register — new user ----------------------------------------
        print(f"\n{Colors.BOLD}--- 2. Auth: Register new user ---{Colors.END}")
        res = client.post(
            "/api/v1/auth/register",
            description="Register new user",
            json={"email": "testuser001@test.com", "password": "TestPass1", "username": "testuser001"},
        )
        assert "access_token" in res, "Missing access_token in register response"
        assert "user_id" in res, "Missing user_id in register response"
        token = res["access_token"]
        user_id = res["user_id"]
        client.headers["Authorization"] = f"Bearer {token}"

        # -- 3. Login — same user -------------------------------------------
        print(f"\n{Colors.BOLD}--- 3. Auth: Login same user ---{Colors.END}")
        res2 = client.post(
            "/api/v1/auth/login",
            description="Login same user",
            json={"email": "testuser001@test.com", "password": "TestPass1"},
        )
        assert res2["user_id"] == user_id, "Login should return same user_id"
        assert "access_token" in res2, "Login should return access_token"

        # -- 4. Create topic ----------------------------------------------
        print(f"\n{Colors.BOLD}--- 4. Topics: Create ---{Colors.END}")
        res = client.post(
            "/api/v1/topics/",
            description="Create topic",
            json={"title": "Test Topic"},
        )
        topic_id = res["topic_id"]
        assert topic_id, "topic_id should not be empty"
        assert res["title"] == "Test Topic"
        assert res["user_id"] == user_id

        # -- 5. List topics -----------------------------------------------
        print(f"\n{Colors.BOLD}--- 5. Topics: List ---{Colors.END}")
        res = client.get(
            "/api/v1/topics/",
            description="List topics for user",
        )
        assert isinstance(res, list) and len(res) > 0, "Should return non-empty list"
        assert res[0]["topic_id"] == topic_id

        # -- 6. Get topic -------------------------------------------------
        print(f"\n{Colors.BOLD}--- 6. Topics: Get by ID ---{Colors.END}")
        res = client.get(
            f"/api/v1/topics/{topic_id}",
            description="Get single topic",
        )
        assert res["title"] == "Test Topic"
        assert res.get("document_text") is None, "No doc uploaded yet"

        # -- 7. Get topic — 404 -------------------------------------------
        print(f"\n{Colors.BOLD}--- 7. Topics: 404 for nonexistent ---{Colors.END}")
        raw = requests.get(f"{base_url}/api/v1/topics/nonexistent_id_999", headers=client.headers)
        assert raw.status_code == 404, f"Expected 404, got {raw.status_code}"
        print(f"{Colors.GREEN}Correctly returned 404{Colors.END}")

        # -- 8. Upload — reject non-PDF -----------------------------------
        print(f"\n{Colors.BOLD}--- 8. Topics: Upload rejects non-PDF ---{Colors.END}")
        raw = requests.post(
            f"{base_url}/api/v1/topics/{topic_id}/upload",
            files={"file": ("notes.txt", b"hello world", "text/plain")},
            headers=client.headers,
        )
        assert raw.status_code == 400, f"Expected 400 for .txt upload, got {raw.status_code}"
        print(f"{Colors.GREEN}Correctly rejected non-PDF upload{Colors.END}")

        # ------------------------------------------------------------------
        #  Chat API Tests
        # ------------------------------------------------------------------

        # -- 9. Send message (SSE) ----------------------------------------
        print(f"\n{Colors.BOLD}--- 9. Chat: Send message (SSE) ---{Colors.END}")

        socket = TestSocket(url=f"{base_url}/api/v1/chat/stream/{topic_id}", actor_name="SSE")
        socket.connect()
        socket.listen(until_event="Replies")
        time.sleep(0.5)

        res = client.post(
            "/api/v1/chat/",
            description="Send first message",
            json={"topic_id": topic_id, "message": "Hello agent"},
        )
        assert res.get("status") == "success", f"Expected status=success, got {res}"
        assert "user_message" in res, "Response missing user_message"
        assert res["user_message"]["role"] == "user"

        socket.join_listener(timeout=30)
        reply_event = next((e for e in socket.events_received if e["event"] == "Replies"), None)
        assert reply_event, "Did not receive SSE Replies event"
        import json as _json
        reply_data = reply_event["data"] if isinstance(reply_event["data"], dict) else _json.loads(reply_event["data"])
        assert reply_data["text"] == "Mock reply to: Hello agent"
        print(f"{Colors.GREEN}SSE reply received: {reply_data['text']}{Colors.END}")

        # -- 10. Verify document context is None fallback -----------------
        print(f"\n{Colors.BOLD}--- 10. Chat: Verify document_text fallback ---{Colors.END}")
        doc_text = _last_ask_kwargs.get("document_text", "")
        assert "No document provided." in doc_text, \
            f"document_text should contain 'No document provided.', got: {doc_text[:50]}..."
        print(f"{Colors.GREEN}Chatbot.ask correctly received expected fallback for document_text{Colors.END}")

        # -- 11. Second message — chat_history passed (SSE) ---------------
        print(f"\n{Colors.BOLD}--- 11. Chat: Second message passes history (SSE) ---{Colors.END}")

        socket2 = TestSocket(url=f"{base_url}/api/v1/chat/stream/{topic_id}", actor_name="SSE")
        socket2.connect()
        socket2.listen(until_event="Replies")
        time.sleep(0.5)

        res2 = client.post(
            "/api/v1/chat/",
            description="Send second message",
            json={"topic_id": topic_id, "message": "Follow-up question"},
        )
        assert res2.get("status") == "success"

        socket2.join_listener(timeout=30)
        reply_event2 = next((e for e in socket2.events_received if e["event"] == "Replies"), None)
        assert reply_event2, "Did not receive SSE Replies event for second message"
        reply_data2 = reply_event2["data"] if isinstance(reply_event2["data"], dict) else _json.loads(reply_event2["data"])
        assert reply_data2["text"] == "Mock reply to: Follow-up question"

        assert _last_ask_kwargs.get("chat_history") is not None, \
            "chat_history should contain previous exchange"
        assert len(_last_ask_kwargs["chat_history"]) >= 2, \
            f"Expected ≥2 history messages, got {len(_last_ask_kwargs['chat_history'])}"
        print(f"{Colors.GREEN}chat_history passed with {len(_last_ask_kwargs['chat_history'])} messages{Colors.END}")

        # -- 12. Get history (includes SSE-persisted replies) -------------
        print(f"\n{Colors.BOLD}--- 12. Chat: Get history ---{Colors.END}")
        history = client.get(
            f"/api/v1/chat/history?topic_id={topic_id}",
            description="Get chat history",
        )
        assert len(history) >= 4, f"Expected ≥4 messages (2 rounds), got {len(history)}"
        timestamps = [m["created_at"] for m in history]
        assert timestamps == sorted(timestamps), "History should be oldest-first"
        print(f"{Colors.GREEN}{len(history)} messages, correctly ordered{Colors.END}")

        # -- 13. Clear history --------------------------------------------
        print(f"\n{Colors.BOLD}--- 13. Chat: Clear history ---{Colors.END}")
        res = client.request(
            "DELETE",
            f"/api/v1/chat/history?topic_id={topic_id}",
            description="Clear chat history",
        )
        assert "message" in res

        history = client.get(
            f"/api/v1/chat/history?topic_id={topic_id}",
            description="Verify history empty",
        )
        assert len(history) == 0, f"Expected empty history, got {len(history)}"
        print(f"{Colors.GREEN}History correctly empty after clear{Colors.END}")

        # -- 14. Chat 404 — bad topic_id ----------------------------------
        print(f"\n{Colors.BOLD}--- 14. Chat: 404 for bad topic_id ---{Colors.END}")
        raw = requests.post(
            f"{base_url}/api/v1/chat/",
            json={"topic_id": "nonexistent_topic_999", "message": "hi"},
            headers=client.headers,
        )
        assert raw.status_code == 404, f"Expected 404, got {raw.status_code}"
        print(f"{Colors.GREEN}Correctly returned 404{Colors.END}")

        # -- 15. Speech STT -----------------------------------------------
        print(f"\n{Colors.BOLD}--- 15. Speech: STT ---{Colors.END}")
        raw = requests.post(
            f"{base_url}/api/v1/speech/stt",
            files={"file": ("test.mp3", b"dummy audio data", "audio/mpeg")},
            headers=client.headers,
        )
        assert raw.status_code == 200, f"Expected 200, got {raw.status_code}"
        res_json = raw.json()
        assert "text" in res_json, "Missing text in STT response"
        assert res_json["text"] == "Mock transcribed text", f"Got: {res_json['text']}"
        print(f"{Colors.GREEN}Successfully tested STT endpoint{Colors.END}")

        # -- Done ---------------------------------------------------------
        print(f"\n{Colors.GREEN}{Colors.BOLD}ALL TESTS PASSED!{Colors.END}")
        print(f"{Colors.GREEN}Started at:  {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(start_time))}{Colors.END}")
        print(f"{Colors.GREEN}Finished at: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time()))}{Colors.END}")
        print(f"{Colors.GREEN}Total time:  {time.time() - start_time:.2f}s{Colors.END}")

    except AssertionError as e:
        print(f"\n{Colors.RED}{Colors.BOLD}TEST FAILED: {e}{Colors.END}")
    except Exception as e:
        print(f"\n{Colors.RED}{Colors.BOLD}ERROR EXECUTING TESTS: {e}{Colors.END}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    run_tests()
