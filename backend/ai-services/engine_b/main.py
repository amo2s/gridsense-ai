import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from dotenv import load_dotenv

# Enforce environment variable loading before any application logic executes
load_dotenv()

from api.prediction_routes import router as prediction_router
from models.risk_classifier import RiskClassifier
from core.events import initialize_redis_pool, close_redis_pool  # Added for stream integration

# Define strict artifact paths
ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "artifacts")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager to handle application startup and shutdown.
    Guarantees artifacts are loaded exactly once into thread-safe memory.

    Delegates all artifact loading (ONNX session, metadata, native LightGBM
    booster, SHAP explainer) to RiskClassifier so there is a single source
    of truth for how the model is initialized — both here and anywhere else
    the classifier might be constructed (e.g. offline evaluation scripts).
    """
    print("[INFO] Initializing Engine B microservice...")

    try:
        # RiskClassifier internally validates that risk_model.onnx,
        # model_metadata.json, and champion_model.txt all exist, and
        # raises FileNotFoundError with a clear message if any are missing.
        app.state.classifier = RiskClassifier(ARTIFACTS_DIR)
        print(f"[INFO] ONNX Model v{app.state.classifier.model_version} loaded into global state.")
    except Exception as e:
        print(f"[FATAL] Failed to initialize artifacts: {str(e)}")
        sys.exit(1)

    # Initialize Upstash Redis connection pool for non-blocking alert stream publishing
    redis_url = os.getenv("UPSTASH_REDIS_URL")
    if not redis_url:
        print("[WARNING] UPSTASH_REDIS_URL is missing. Alert stream publishing will be disabled.")
    else:
        initialize_redis_pool(redis_url)
        print("[INFO] Upstash Redis connection pool established.")

    yield  # Yield control to the application to start accepting traffic

    # Shutdown: Clean up memory resources and network pools
    print("[INFO] Shutting down Engine B microservice...")
    app.state.classifier = None
    close_redis_pool()

# Initialize FastAPI application
app = FastAPI(
    title="GridSense AI - Engine B (Outage Risk)",
    description="Stateless predictive risk inference service",
    version="1.0.0",
    lifespan=lifespan
)

# Register the internal API routes
app.include_router(prediction_router)

@app.get("/api/v1/health")
async def health_check():
    """
    Immediate health check endpoint for the Go Gateway orchestration.
    """
    return {
        "status": "healthy",
        "service": "engine_b_risk",
        "model_version": app.state.classifier.model_version
    }