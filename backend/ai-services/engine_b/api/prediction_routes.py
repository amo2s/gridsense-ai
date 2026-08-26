import asyncio
from fastapi import APIRouter, Request, HTTPException

from schemas.inference_contracts import PredictionRequest, PredictionResponse
from models.risk_classifier import RiskClassifier

router = APIRouter(prefix="/internal/v1", tags=["Inference"])


@router.post("/predict", response_model=PredictionResponse)
async def predict_outage_risk(payload: PredictionRequest, request: Request):
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
        return response
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        raise HTTPException(status_code=500, detail="Internal inference engine failure.")