"""Speech route for audio transcription (STT)."""
from fastapi import APIRouter, File, UploadFile, HTTPException

from srcs.services.speech_service import SpeechService

router: APIRouter = APIRouter(prefix="/api/v1/speech", tags=["speech"])


@router.post("/stt")
async def speech_to_text(file: UploadFile = File(...)) -> dict[str, str]:
    """Transcribe an uploaded audio file to text using ElevenLabs Scribe."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content: bytes = await file.read()
    transcript: str | None = await SpeechService.transcribe_audio(content)

    if transcript is None:
        raise HTTPException(status_code=500, detail="Speech-to-text processing failed or returned no text")

    return {"text": transcript}
