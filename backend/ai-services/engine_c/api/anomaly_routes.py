import asyncio
from fastapi import APIRouter, Depends, Request, status, BackgroundTasks
from schemas.anomaly_contracts import TelemetryWindowRequest, AnomalyResponse
from security.auth import verify_internal_token
from models.anomaly_detector import AnomalyDetector
from core.events import evaluate_and_publish_alert  # Abstracted hook for Phase 8 stream publishing

# Step 5.3.1: Mount POST /internal/v1/anomalies/detect
router = APIRouter(
    prefix="/internal/v1/anomalies",
    tags=["Anomalies"],
    # Step 5.3.2 & 6.1.1: Internal service authentication check
    dependencies=[Depends(verify_internal_token)]
)

@router.post("/detect", response_model=AnomalyResponse, status_code=status.HTTP_200_OK)
async def detect_anomalies(request: TelemetryWindowRequest, raw_request: Request, background_tasks: BackgroundTasks):
    """
    Executes the centralized orchestrator against a rolling telemetry window.
    """
    # Fetch the pre-warmed detector from the app state
    detector: AnomalyDetector = raw_request.app.state.detector
    
    # Pass the Pydantic validated request to the unified detection engine.
    # Offload CPU-bound inference (STL/MAD/Isolation Forest) to a worker thread
    # so the main ASGI event loop isn't blocked.
    response = await asyncio.to_thread(detector.detect, request)
    
    # Offload the threshold check and Redis Stream publication to a background task.
    # This prevents blocking the gateway and ensures zero inference latency impact.
    background_tasks.add_task(evaluate_and_publish_alert, "Engine C", request, response)
    
    return response