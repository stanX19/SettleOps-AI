import os
import uuid
import asyncio
import traceback

from elevenlabs.client import ElevenLabs

from srcs.config import get_settings

# -- ElevenLabs client (lazy singleton) ----------------------------------------

_elevenlabs_client: ElevenLabs | None = None


def _get_elevenlabs_client() -> ElevenLabs:
    global _elevenlabs_client
    if _elevenlabs_client is None:
        settings = get_settings()
        _elevenlabs_client = ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
    return _elevenlabs_client


class SpeechService:
    LANG_ENGLISH = "en"
    LANG_MALAY = "ms"
    DEFAULT_LANG = LANG_ENGLISH

    # -- TTS (public) ------------------------------------------------------

    @staticmethod
    async def generate_tts(
        text: str,
        voice_id: str | None = None,
        model_id: str | None = None,
        language_code: str | None = None,
    ) -> str | None:
        """Generate speech from text using ElevenLabs."""
        return await SpeechService._tts_elevenlabs(text, voice_id=voice_id, model_id=model_id)

    # -- STT (public) ------------------------------------------------------

    @staticmethod
    async def transcribe_audio(
        audio_data: bytes,
        language_code: str | None = None,
    ) -> str | None:
        """Transcribe audio bytes to text using ElevenLabs Scribe."""
        return await SpeechService._stt_elevenlabs(audio_data)

    @staticmethod
    async def transcribe_audio_file(
        filepath: str,
        language_code: str | None = None,
    ) -> str | None:
        """Convenience wrapper: read a file from disk then transcribe."""
        try:
            with open(filepath, "rb") as f:
                audio_data = f.read()
            return await SpeechService.transcribe_audio(audio_data, language_code)
        except Exception as exc:
            traceback.print_exc()
            print(f"STT File Error: {exc}")
            return None

    # -- Background TTS + SSE emit -----------------------------------------

    @staticmethod
    def enqueue_tts_and_emit(
        session_id: str,
        text: str,
        language_code: str | None = None,
    ) -> None:
        """Fire-and-forget TTS → SSE push."""
        from srcs.services.sse_service import SseService
        from srcs.schemas.chat_dto import SseTTSResultData

        async def _generate_and_emit() -> None:
            url = await SpeechService.generate_tts(text, language_code=language_code)
            if url:
                await SseService.emit(session_id, SseTTSResultData(text=text, audio_url=url))

        asyncio.create_task(_generate_and_emit())

    # -- ElevenLabs implementations ----------------------------------------

    @staticmethod
    async def _tts_elevenlabs(
        text: str,
        voice_id: str | None = None,
        model_id: str | None = None,
    ) -> str | None:
        settings = get_settings()
        try:
            filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
            upload_dir = os.path.join(settings.UPLOAD_DIR, "tts")
            os.makedirs(upload_dir, exist_ok=True)
            filepath = os.path.join(upload_dir, filename)

            def _call() -> None:
                client = _get_elevenlabs_client()
                audio_iterator = client.text_to_speech.convert(
                    text=text,
                    voice_id=voice_id or settings.ELEVENLABS_DEFAULT_VOICE_ID,
                    model_id=model_id or settings.ELEVENLABS_MODEL,
                )
                with open(filepath, "wb") as f:
                    for chunk in audio_iterator:
                        if isinstance(chunk, bytes):
                            f.write(chunk)

            await asyncio.to_thread(_call)
            return f"/media/tts/{filename}"
        except Exception as exc:
            traceback.print_exc()
            print(f"ElevenLabs TTS Error: {exc}")
            return None

    @staticmethod
    async def _stt_elevenlabs(audio_data: bytes) -> str | None:
        try:
            def _call() -> str:
                client = _get_elevenlabs_client()
                result = client.speech_to_text.convert(
                    file=audio_data,
                    model_id="scribe_v1",
                )
                return result.text

            return await asyncio.to_thread(_call)
        except Exception as exc:
            traceback.print_exc()
            print(f"ElevenLabs STT Error: {exc}")
            return None


if __name__ == "__main__":
    import sys

    if sys.platform.startswith("win") and sys.version_info < (3, 14):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    async def main():
        service = SpeechService()

        print("=== English TTS (ElevenLabs) ===")
        url = await service.generate_tts(
            "Hello! This is a test of the ElevenLabs text to speech integration.",
            language_code="en",
        )
        print(f"  Audio URL: {url}")

    asyncio.run(main())
