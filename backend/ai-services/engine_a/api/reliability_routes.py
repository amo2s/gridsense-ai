from fastapi import APIRouter, Depends
from schemas.ingestion import OperationalPayload
from schemas.egress import EgressPayload
from api.dependencies import verify_gateway_token
from core.scoring_engine import evaluate_reliability

# Initialize the router and inject the security dependency globally for all routes attached to it.
router = APIRouter(
    prefix="/api/v1/reliability",
    tags=["Reliability Scoring"],
    dependencies=[Depends(verify_gateway_token)]
)

@router.post("/evaluate", response_model=EgressPayload)
def evaluate_asset(payload: OperationalPayload) -> EgressPayload:
    """
    Executes the deterministic reliability scoring cycle for a given grid asset[cite: 1].
    
    The incoming JSON payload is automatically validated against the OperationalPayload 
    Pydantic boundaries in C (via pydantic-core) before this function is ever called. 
    Malformed data is instantly rejected with a 422 Unprocessable Entity response[cite: 1].
    
    Args:
        payload (OperationalPayload): The strictly validated ingestion contract[cite: 1].
        
    Returns:
        EgressPayload: The standardized deterministic response model[cite: 1].
    """
    # Execute the central orchestrator and return the immutable egress contract
    return evaluate_reliability(payload=payload)