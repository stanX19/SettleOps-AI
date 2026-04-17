from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from srcs.database import engine, Base
import srcs.models.user
import srcs.models.chat_message

from fastapi.staticfiles import StaticFiles

from srcs.routes.health import router as health_router
from srcs.routes.auth import router as auth_router
from srcs.routes.chat import router as chat_router
from srcs.routes.speech import router as speech_router

from srcs.config import get_settings
import os

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Init DB tables
    Base.metadata.create_all(bind=engine)
    yield

settings = get_settings()

app = FastAPI(title="Skeleton Backend", lifespan=lifespan)

# CORS setup for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change to specific frontend domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Routers ------------------------------------------------------------------
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(speech_router)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
