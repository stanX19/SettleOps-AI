from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from srcs.database import engine, Base
import srcs.models.user
import srcs.models.chat_message
import srcs.models.agent_prompt

from fastapi.staticfiles import StaticFiles

from srcs.routes.health import router as health_router
from srcs.routes.auth import router as auth_router
from srcs.routes.chat import router as chat_router
from srcs.routes.speech import router as speech_router
from srcs.routes.claim import router as claim_router, mock_router as claim_mock_router
from srcs.routes.cases import router as cases_router
from srcs.routes.signature import router as signature_router
from srcs.routes.agent_prompts import router as agent_prompts_router

from srcs.schemas.case_dto import ErrorCode
from srcs.services.case_service import ApiError

from srcs.config import get_settings
import os

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Init DB tables
    Base.metadata.create_all(bind=engine)
    
    # Seed a default case for development/testing
    from srcs.services.case_store import CaseStore, CaseState, now_iso, CaseStatus
    if not CaseStore.get("CLM-2026-00001"):
        CaseStore.add(CaseState(
            case_id="CLM-2026-00001",
            submitted_at=now_iso(),
            status=CaseStatus.AWAITING_APPROVAL # Start in a state where analysis is done
        ))
        print("INFO: Seeded development case CLM-2026-00001", flush=True)
        
    yield

settings = get_settings()

app = FastAPI(title="Skeleton Backend", lifespan=lifespan)

# CORS setup for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(ApiError)
async def _api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    """Flatten ApiError to the documented `{detail, code}` response shape.

    Scoped to ApiError only so framework HTTPExceptions (auth challenges,
    rate-limit Retry-After, etc.) keep their default headers and body.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Map missing-body-field errors on multipart uploads to the documented
    400 `MISSING_REQUIRED_FILES` contract shape.

    FastAPI's default 422 body is `{"detail": [...]}` with a different schema
    than our API contract, and callers relying on the contract's `code` field
    would not see `MISSING_REQUIRED_FILES`. Route signatures can stay required
    (so the generated OpenAPI schema stays honest) because this handler is
    what produces the contract-compliant error.

    Other validation errors fall through to the default 422 shape so we don't
    silently change behaviour for JSON bodies, path params, or query strings.
    """
    errors = exc.errors()
    content_type = request.headers.get("content-type", "")
    missing_body_fields = [
        e for e in errors
        if e.get("type") == "missing"
        and isinstance(e.get("loc"), (list, tuple))
        and len(e["loc"]) >= 2
        and e["loc"][0] == "body"
    ]
    if missing_body_fields and content_type.startswith("multipart/form-data"):
        names = [str(e["loc"][-1]) for e in missing_body_fields]
        return JSONResponse(
            status_code=400,
            content={
                "detail": f"Missing required files: {', '.join(names)}",
                "code": ErrorCode.MISSING_REQUIRED_FILES.value,
            },
        )

    return JSONResponse(status_code=422, content={"detail": errors})


# -- Routers ------------------------------------------------------------------
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(speech_router)
app.include_router(claim_router)
if settings.DEBUG:
    app.include_router(claim_mock_router)
app.include_router(cases_router)
app.include_router(signature_router)
app.include_router(agent_prompts_router)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
