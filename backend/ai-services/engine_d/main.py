"""
Phase 4: High-Performance Inference Execution (main.py)
Application entry point. Initializes FastAPI, locks the ONNX model into memory,
and mounts the routing infrastructure.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import onnxruntime as ort

# Import the router once implemented
# from api.prioritization_routes import router as prioritization_router

ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "hybrid_ranker.onnx")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application lifecycle.
    Loads the ONNX binary into memory once at startup to ensure sub-millisecond inference.
    """
    if not os.path.exists(ARTIFACT_PATH):
        raise FileNotFoundError(f"Critical Error: ONNX artifact not found at {ARTIFACT_PATH}")
    
    # Load the ONNX model into memory and bind to application state
    app.state.ort_session = ort.InferenceSession(
        ARTIFACT_PATH, 
        providers=["CPUExecutionProvider"]
    )
    print(f"Successfully loaded ONNX artifact from {ARTIFACT_PATH}")
    
    yield
    
    # Cleanup during shutdown
    app.state.ort_session = None
    print("ONNX session terminated.")

app = FastAPI(
    title="GridSense AI - Intelligence Engine D (Prioritization)",
    version="1.0.0",
    lifespan=lifespan
)

# Restrict CORS to internal gateway boundaries in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to Go Gateway IP in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the endpoints
# app.include_router(prioritization_router, prefix="/api/v1/priorities")

@app.get("/health")
async def health_check():
    """Service health and memory state verification."""
    return {
        "status": "healthy", 
        "engine": "D", 
        "model_loaded": hasattr(app.state, "ort_session") and app.state.ort_session is not None
    }