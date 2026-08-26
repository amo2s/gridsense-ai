import os
import hmac
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader
from dotenv import load_dotenv

load_dotenv()

API_KEY_NAME = "X-Internal-Service-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

INTERNAL_SERVICE_SECRET = os.getenv("ENGINE_C_INTERNAL_KEY", "default-fallback-insecure-key")

def verify_internal_token(header_key: str = Security(api_key_header)) -> str:
    """
    Step 6.1.1: Constant-time internal service authentication.
    Uses hmac.compare_digest to eliminate timing-attack vulnerabilities.
    """
    if not header_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing required internal authentication header: X-Internal-Service-Key"
        )
    
    # Constant-time comparison to prevent timing attacks
    is_valid = hmac.compare_digest(
        header_key.encode("utf-8"), 
        INTERNAL_SERVICE_SECRET.encode("utf-8")
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal service token."
        )
        
    return header_key