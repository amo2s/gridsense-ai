from fastapi import APIRouter, Depends, BackgroundTasks
from schemas.ingestion import OperationalPayload
from schemas.egress import EgressPayload
from api.dependencies import verify_gateway_token
from core.scoring_engine import evaluate_reliability
from core.events import evaluate_and_publish_alert # Abstracted hook for Phase 8

# Initialize the router and inject the security dependency globally for all routes attached to it.
router = APIRouter(
    prefix="/api/v1/reliability",
    tags=["Reliability Scoring"],
    dependencies=[Depends(verify_gateway_token)]
)

@router.post("/evaluate", response_model=EgressPayload)
def evaluate_asset(payload: OperationalPayload, background_tasks: BackgroundTasks) -> EgressPayload:
    """
    Executes the deterministic reliability scoring cycle for a given grid asset.
    
    The incoming JSON payload is automatically validated against the OperationalPayload 
    Pydantic boundaries in C (via pydantic-core) before this function is ever called. 
    Malformed data is instantly rejected with a 422 Unprocessable Entity response.
    
    Args:
        payload (OperationalPayload): The strictly validated ingestion contract.
        background_tasks (BackgroundTasks): FastAPI background queue for non-blocking stream publishing.
        
    Returns:
        EgressPayload: The standardized deterministic response model.
    """
    # Execute the central orchestrator and return the immutable egress contract
    result = evaluate_reliability(payload=payload)
    
    # Offload the threshold check and Redis Stream publication to a background task.
    # This ensures zero latency impact on the critical path of the Gateway's HTTP request.
    background_tasks.add_task(evaluate_and_publish_alert, "Engine A", payload, result)
    
    return result