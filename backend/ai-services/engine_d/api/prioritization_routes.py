"""
Phase 4: High-Performance Inference Execution (api/prioritization_routes.py)
Binds Pydantic validation directly to incoming network POST requests and routes 
data to the inference class.
"""

from fastapi import APIRouter, HTTPException, Request
import logging

from schemas.ranking_contracts import PrioritizationRequest, PrioritizationResponse
from features.fusion_pipeline import vectorize_payload_to_tensor
from models.hybrid_ranker import execute_ranking

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/rank", response_model=PrioritizationResponse)
async def rank_interventions(payload: PrioritizationRequest, request: Request) -> PrioritizationResponse:
    """
    Receives multi-engine signals, executes ONNX ranking inference, 
    and returns a strictly sorted priority list.
    """
    try:
        # 1. Access the memory-locked ONNX session from the application state
        if not hasattr(request.app.state, "ort_session") or request.app.state.ort_session is None:
            raise RuntimeError("ONNX InferenceSession is not initialized in application state.")
        
        ort_session = request.app.state.ort_session

        # 2. Vectorize the validated Pydantic payload using Polars
        input_tensor, feeder_ids = vectorize_payload_to_tensor(payload)

        # 3. Execute inference and generate XAI explanations
        response = execute_ranking(
            ort_session=ort_session,
            input_tensor=input_tensor,
            feeder_ids=feeder_ids,
            query_id=payload.query_id
        )

        return response

    except Exception as e:
        logger.error(f"Inference execution failed for query {payload.query_id}: {str(e)}")
        # Raise a rigid HTTP 500 exception so the Go Gateway receives a standard HTTP status
        raise HTTPException(
            status_code=500, 
            detail="Internal server error during ranking inference"
        )