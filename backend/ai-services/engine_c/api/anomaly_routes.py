from fastapi import APIRouter, Depends, Request, status
from schemas.anomaly_contracts import TelemetryWindowRequest, AnomalyResponse
from security.auth import verify_internal_token
from models.anomaly_detector import AnomalyDetector

# Step 5.3.1: Mount POST /internal/v1/anomalies/detect
router = APIRouter(
    prefix="/internal/v1/anomalies",
    tags=["Anomalies"],
    # Step 5.3.2 & 6.1.1: Internal service authentication check
    dependencies=[Depends(verify_internal_token)]
)

@router.post("/detect", response_model=AnomalyResponse, status_code=status.HTTP_200_OK)
def detect_anomalies(request: TelemetryWindowRequest, raw_request: Request):
    """
    Executes the centralized orchestrator against a rolling telemetry window.
    """
    # Fetch the pre-warmed detector from the app state
    detector: AnomalyDetector = raw_request.app.state.detector
    
    # Pass the Pydantic validated request to the unified detection engine
    return detector.detect(request)