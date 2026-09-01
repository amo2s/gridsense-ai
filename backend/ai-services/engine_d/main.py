"""
Phase 4: High-Performance Inference Execution (main.py)
Application entry point. Initializes FastAPI, locks the ONNX model into memory,
and mounts the routing infrastructure.
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load environment variables from .env file before anything else reads them
load_dotenv()

import onnxruntime as ort
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from api.prioritization_routes import router as prioritization_router

# ==========================================
# LOGGING
# ==========================================
# Configured here, at the entry point, so every module's module-level
# logger (hybrid_ranker.py, prioritization_routes.py, etc.) actually emits
# output instead of silently going nowhere.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "hybrid_ranker.onnx")

# Shared secret with the Go Gateway. Must match ENGINE_D_INTERNAL_KEY used
# in gateway/services/gateway/handlers.go's X-Internal-Service-Key header.
INTERNAL_SERVICE_KEY = os.getenv("ENGINE_D_INTERNAL_KEY")

# Comma-separated list of allowed origins, e.g. "http://gateway.internal:8080".
# No wildcard default in production - an unset env var means CORS stays
# fully locked down (empty allow-list) rather than silently permissive.
_raw_origins = os.getenv("ENGINE_D_ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application lifecycle.
    Loads the ONNX binary into memory once at startup to ensure sub-millisecond inference.
    """
    if not INTERNAL_SERVICE_KEY:
        logger.warning(
            "ENGINE_D_INTERNAL_KEY is not set - all requests to /api/v1/priorities "
            "will be rejected until this is configured."
        )

    if not os.path.exists(ARTIFACT_PATH):
        logger.critical("ONNX artifact not found at %s", ARTIFACT_PATH)
        raise FileNotFoundError(f"Critical Error: ONNX artifact not found at {ARTIFACT_PATH}")

    try:
        app.state.ort_session = ort.InferenceSession(
            ARTIFACT_PATH,
            providers=["CPUExecutionProvider"]
        )
    except Exception:
        logger.critical("Failed to load ONNX artifact from %s", ARTIFACT_PATH, exc_info=True)
        raise

    logger.info("Successfully loaded ONNX artifact from %s", ARTIFACT_PATH)

    yield

    app.state.ort_session = None
    logger.info("ONNX session terminated.")


app = FastAPI(
    title="GridSense AI - Intelligence Engine D (Prioritization)",
    version="1.0.0",
    lifespan=lifespan
)

# Locked to explicit internal origins only. No wildcard, no credentials
# unless actually needed - this is a service-to-service API behind the Go
# Gateway, not a browser-facing endpoint.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type", "X-Internal-Service-Key"],
)


@app.middleware("http")
async def verify_internal_service_key(request: Request, call_next):
    """
    Rejects any request that doesn't present the shared internal service key,
    except for the health check (which the orchestrator/load balancer needs
    to hit without credentials).
    """
    if request.url.path == "/health":
        return await call_next(request)

    provided_key = request.headers.get("X-Internal-Service-Key")
    if not INTERNAL_SERVICE_KEY or provided_key != INTERNAL_SERVICE_KEY:
        logger.warning(
            "Rejected request with missing/invalid internal service key",
            extra={"path": request.url.path},
        )
        return JSONResponse(
            status_code=401,
            content={"detail": "Missing or invalid internal service credentials"},
        )

    return await call_next(request)


app.include_router(prioritization_router, prefix="/api/v1/priorities")


@app.get("/health")
async def health_check():
    """Service health and memory state verification."""
    return {
        "status": "healthy",
        "engine": "D",
        "model_loaded": hasattr(app.state, "ort_session") and app.state.ort_session is not None
    }