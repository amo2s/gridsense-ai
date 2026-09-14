import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load environment variables from .env file before any internal modules read them
load_dotenv()

import asyncpg
from pgvector.asyncpg import register_vector
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from api.assistant_routes import router as assistant_router

# ==========================================
# LOGGING
# ==========================================
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("GridSense-AI-Assistant")

DATABASE_URL = os.getenv("DATABASE_URL")
INTERNAL_SERVICE_KEY = os.getenv("ASSISTANT_INTERNAL_KEY")

_raw_origins = os.getenv("ASSISTANT_ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]


async def init_db_connection(conn):
    """
    Registers pgvector on every new connection spawned by the pool.
    Targets the 'extensions' schema to match Supabase architecture.
    """
    await register_vector(conn, schema='extensions')


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages application lifecycle: establishes the asyncpg connection pool at startup
    and binds it to the application state for dependency injection.
    """
    if not INTERNAL_SERVICE_KEY:
        logger.warning(
            "ASSISTANT_INTERNAL_KEY is not set - all requests to /api/assistant "
            "will be rejected until this is configured."
        )

    if not DATABASE_URL:
        logger.critical("DATABASE_URL is not set. Service cannot initialize.")
        raise ValueError("Critical Error: DATABASE_URL environment variable is missing.")

    try:
        app.state.db_pool = await asyncpg.create_pool(
            dsn=DATABASE_URL,
            init=init_db_connection,
            min_size=2,
            max_size=10
        )
        logger.info("Successfully established PostgreSQL connection pool.")
    except Exception:
        logger.critical("Failed to initialize database pool", exc_info=True)
        raise

    yield

    if hasattr(app.state, "db_pool") and app.state.db_pool:
        await app.state.db_pool.close()
        logger.info("PostgreSQL connection pool terminated.")


app = FastAPI(
    title="GridSense AI - Sovereign Assistant Service",
    version="1.0.0",
    lifespan=lifespan
)

# Locked to explicit internal origins only (e.g., Go API Gateway Docker network)
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
    Rejects any request without the shared internal service key,
    exempting the /health probe for Docker/Gateway pinging.
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


# Mount the egress routing for the assistant pipeline
app.include_router(assistant_router)


@app.get("/health")
async def health_check():
    """
    Health probe verifying API availability and database connection status.
    """
    is_db_connected = hasattr(app.state, "db_pool") and app.state.db_pool is not None
    
    return {
        "status": "healthy" if is_db_connected else "degraded",
        "service": "AI Assistant Service",
        "database_connected": is_db_connected
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)