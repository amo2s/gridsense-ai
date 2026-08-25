import os
import secrets
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader

# Define the expected HTTP header that the Go gateway will attach
API_KEY_NAME = "X-Gateway-Token"
gateway_token_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def verify_gateway_token(header_token: str = Security(gateway_token_header)) -> str:
    """
    Validates the internal inter-service authentication header.
    
    This function acts as a dependency injected into the route signature. It ensures
    that only the internal Go gateway can trigger computational cycles[cite: 1].
    
    Args:
        header_token (str): The token extracted directly from the incoming HTTP request.
        
    Returns:
        str: The validated token, allowing the request to proceed to the payload parsing.
        
    Raises:
        HTTPException: 403 Forbidden if the token is invalid or missing, dropping 
                       the request immediately[cite: 1].
        HTTPException: 500 Internal Server Error if the environment is misconfigured.
    """
    # Fetch the expected secret token loaded into memory from the .env file
    expected_token = os.getenv("INTERNAL_SERVICE_KEY")
    
    if not expected_token:
        # Failsafe: Lock down the service if the environment variable is missing
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Configuration anomaly: Missing internal service key."
        )
        
    # Constant-time comparison prevents timing attacks by evaluating the entire 
    # string length regardless of where a mismatch occurs
    if not header_token or not secrets.compare_digest(header_token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized computational request: Invalid gateway token."
        )
        
    return header_token