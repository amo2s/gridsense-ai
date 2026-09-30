import os
import asyncio
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Header, Depends

from schemas.inference_contracts import PredictionRequest, PredictionResponse
from models.risk_classifier import RiskClassifier
from core.events import evaluate_and_publish_alert  # Abstracted hook for Phase 8 stream publishing

# SECURITY UPDATE: Extract the expected internal key from the environment
EXPECTED_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY")

# SECURITY UPDATE: Define a dependency to enforce and validate the authorization header
async def verify_internal_key(x_internal_service_key: str = Header(..., alias="X-Internal-Service-Key")):
    if not EXPECTED_SERVICE_KEY:
        # Failsafe: Prevent open access if the container environment was misconfigured
        raise HTTPException(status_code=500, detail="Server configuration error: missing internal service key.")
    
    if x_internal_service_key != EXPECTED_SERVICE_KEY:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid internal service key.")

# SECURITY UPDATE: Inject the verification dependency directly into the router 
# This automatically protects /predict and any future endpoints added to this router
router = APIRouter(
    prefix="/internal/v1", 
    tags=["Inference"],
    dependencies=[Depends(verify_internal_key)]
)


@router.post("/predict", response_model=PredictionResponse)
async def predict_outage_risk(payload: PredictionRequest, request: Request, background_tasks: BackgroundTasks):
    """
    Internal endpoint to predict feeder outage risk.
    Strictly isolated from external networks by the Go Gateway.
    """
    classifier: RiskClassifier | None = getattr(request.app.state, "classifier", None)

    if classifier is None:
        raise HTTPException(status_code=503, detail="AI artifacts not loaded into memory.")

    try:
        # Offload the heavy mathematical computation (vectorization, ONNX
        # inference, SHAP explanation) to a background thread so the ASGI
        # event loop isn't blocked during high-throughput loads.
        response = await asyncio.to_thread(classifier.predict, payload)
        
        # Offload the risk threshold check and Redis Stream publication to a background task.
        # This prevents blocking the ASGI event loop and Go Gateway.
        background_tasks.add_task(evaluate_and_publish_alert, "Engine B", payload, response)
        
        return response
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="Internal inference engine failure.")