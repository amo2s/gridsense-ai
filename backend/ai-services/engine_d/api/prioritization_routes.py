"""
Phase 4: High-Performance Inference Execution (api/prioritization_routes.py)
Binds Pydantic validation directly to incoming network POST requests and routes 
data to the inference class.
"""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from schemas.ranking_contracts import PrioritizationRequest, PrioritizationResponse
from features.fusion_pipeline import vectorize_payload_to_tensor
from models.hybrid_ranker import execute_ranking, InferenceError

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/rank", response_model=PrioritizationResponse)
async def rank_interventions(payload: PrioritizationRequest, request: Request) -> PrioritizationResponse:
    """
    Receives multi-engine signals, executes ONNX ranking inference,
    and returns a strictly sorted priority list.
    """
    # 1. Access the memory-locked ONNX session from the application state.
    # Not wrapped in the try/except below - a missing session is a
    # deployment/startup fault, not a per-request inference fault, and
    # should always surface as 503 regardless of what else fails downstream.
    ort_session = getattr(request.app.state, "ort_session", None)
    if ort_session is None:
        logger.error(
            "ONNX InferenceSession not initialized in application state",
            extra={"query_id": payload.query_id},
        )
        raise HTTPException(
            status_code=503,
            detail="Ranking service is not ready: model artifact not loaded",
        )

    # 2. Vectorize the validated Pydantic payload using Polars
    try:
        input_tensor, feeder_ids = vectorize_payload_to_tensor(payload)
    except Exception as exc:
        logger.error(
            "Payload vectorization failed",
            extra={"query_id": payload.query_id},
            exc_info=exc,
        )
        raise HTTPException(
            status_code=422,
            detail="Failed to vectorize input payload: malformed or inconsistent asset data",
        ) from exc

    # 3. Execute inference and generate XAI explanations
    try:
        response = execute_ranking(
            ort_session=ort_session,
            input_tensor=input_tensor,
            feeder_ids=feeder_ids,
            query_id=payload.query_id,
        )
        return response

    except InferenceError as exc:
        # Input-shape/NaN/ONNX-runtime failures raised deliberately by
        # hybrid_ranker.py - treat as a bad-gateway condition, matching
        # gateway/handlers.go's ErrAIValidation -> 502 branch.
        logger.error(
            "Inference execution failed",
            extra={"query_id": payload.query_id},
            exc_info=exc,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Ranking inference failed: {exc}",
        ) from exc

    except ValidationError as exc:
        # Raised by PrioritizationResponse's @model_validator if the egress
        # sort-order guardrail fails - this means our own ranking logic
        # produced an invalid contract, which is a bug, not a bad request.
        logger.error(
            "Egress contract validation failed",
            extra={"query_id": payload.query_id},
            exc_info=exc,
        )
        raise HTTPException(
            status_code=500,
            detail="Internal ranking contract violation",
        ) from exc

    except Exception as exc:
        # Genuinely unexpected failure - true 500, but now with full
        # stack trace preserved via exc_info instead of just str(e).
        logger.error(
            "Unexpected error during ranking inference",
            extra={"query_id": payload.query_id},
            exc_info=exc,
        )
        raise HTTPException(
            status_code=500,
            detail="Internal server error during ranking inference",
        )