import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv, find_dotenv

# Locate and load the .env file from the project root before loading routes
load_dotenv(find_dotenv())

from api.reliability_routes import router as reliability_router

# Initialize structured logging for execution latencies and system tracking
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("engine_a")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages application startup and shutdown lifecycle events."""
    logger.info("GridSense AI: Engine A initializing...")
    # Future dependency initializations (e.g., loading config/scoring_weights.json) can occur here
    yield
    logger.info("GridSense AI: Engine A shutting down.")

# Instantiate FastAPI with explicit metadata for automatic OpenAPI schema generation
app = FastAPI(
    title="GridSense AI - Intelligence Engine A",
    description="Deterministic reliability scoring microservice.",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS for local development and Swagger UI testing.
# Server-to-server traffic across the Docker bridge (from Go on 8081) will not trigger browser CORS checks,
# but this explicitly permits the Go gateway origin for any client-side testing tools.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8080",
        "http://127.0.0.1:8080"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the reliability REST endpoints to the main application
app.include_router(reliability_router)

@app.get("/healthz", status_code=200, tags=["System"])
async def health_check_z():
    """
    Public liveness and readiness probe for Docker / orchestrator checks.
    Does not require X-Gateway-Token.
    """
    return {
        "status": "ok",
        "service": "engine_a",
        "version": "1.0.0"
    }
    
@app.get("/health", tags=["System"])
def health_check_standard():
    """
    Lightweight health probe for Docker container orchestration and network routing.
    """
    return {"status": "healthy", "service": "engine_a"}