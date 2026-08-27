import json
import logging
from pathlib import Path
from contextlib import asynccontextmanager
import os

import joblib
import numpy as np
import onnxruntime as ort
import structlog
from fastapi import FastAPI, status
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from prometheus_fastapi_instrumentator import Instrumentator
from dotenv import load_dotenv

from api.anomaly_routes import router as anomaly_router
from models.anomaly_detector import AnomalyDetector

# Load Environment Variables
load_dotenv()

# Step 6.3: Configure Structlog for JSON structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ]
)
logger = structlog.get_logger("engine_c.main")

ARTIFACTS_DIR = Path("artifacts")

# Step 6.2: Configure SlowAPI rate limiter
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Step 5.4.1: Lifespan artifact loading directly into app.state.
    Loads all JSON baselines, PyOD ensembles, and ONNX binaries directly into RAM.
    """
    logger.info("service_startup_initiated")
    try:
        # Load Phase 1 & 2 Metadata
        with open(ARTIFACTS_DIR / "model_metadata.json", "r") as f:
            metadata = json.load(f)
        with open(ARTIFACTS_DIR / "seasonal_baselines.json", "r") as f:
            seasonal = json.load(f)
            
        # Load Phase 2 PyOD Models
        pyod = joblib.load(ARTIFACTS_DIR / "pyod_ensemble.joblib")
        
        # Initialize Phase 2 ONNX C++ Runtime (CPU Optimized)
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        onnx_sess = ort.InferenceSession(
            str(ARTIFACTS_DIR / "isolation_forest.onnx"),
            sess_options,
            providers=["CPUExecutionProvider"]
        )
        
        # Warmup ONNX runtime
        onnx_sess.run(None, {"float_input": np.zeros((1, 5), dtype=np.float32)})
        
        # Initialize orchestrator into app.state
        app.state.detector = AnomalyDetector(
            metadata=metadata,
            seasonal_baselines=seasonal,
            pyod_ensemble=pyod,
            onnx_session=onnx_sess
        )
        app.state.metadata = metadata
        
        logger.info("service_startup_completed", model_version=metadata["version"])
        yield
    except Exception as e:
        logger.error("service_startup_failed", error=str(e))
        raise RuntimeError("Failed to load artifacts during startup") from e
    finally:
        logger.info("service_shutdown_completed")

app = FastAPI(
    title="GridSense AI - Engine C",
    description="High-Performance Core Anomaly Detection Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Step 6.2: Mount SlowAPI rate limiting exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Step 5.4.3: Prometheus instrumentation for latency/error metrics
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# Step 5.3: Mount the protected internal router
app.include_router(anomaly_router)

@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """
    SLA & Kubernetes Readiness Probe.
    """
    return {
        "status": "healthy",
        "model_version": getattr(app.state, "metadata", {}).get("version", "unknown")
    }