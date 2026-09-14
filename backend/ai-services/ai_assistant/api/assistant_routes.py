import os
import json
import hashlib
import logging
from typing import List, Dict, Any, Optional
import httpx
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request

from schemas.assistant_contracts import GatewayQueryPayload, AssistantResponse
from services.context_assembler import assemble_prompt_context, generate_constrained_response
from services.retrieval import retrieve_hybrid_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assistant", tags=["Assistant"])

# ---------------------------------------------------------
# Upstash REST & Cache Configuration
# ---------------------------------------------------------
UPSTASH_REDIS_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL", "").rstrip("/")
UPSTASH_REDIS_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
CACHE_TTL_SECONDS = int(os.getenv("ASSISTANT_CACHE_TTL_SECONDS", "3600"))

def generate_cache_key(payload: GatewayQueryPayload) -> str:
    """
    Constructs a deterministic SHA-256 cache key based on the query and contextual state.
    """
    feeder_id = getattr(payload, "feeder_id", "global")
    raw_key = f"gridsense:assistant:{feeder_id}:{payload.query.strip().lower()}"
    digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    return f"assistant_cache:{digest}"

async def fetch_upstash_cache(cache_key: str) -> Optional[str]:
    """
    Executes an atomic REST command to check Upstash Redis cache.
    """
    if not UPSTASH_REDIS_REST_URL or not UPSTASH_REDIS_REST_TOKEN:
        return None

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.post(
                UPSTASH_REDIS_REST_URL,
                headers={"Authorization": f"Bearer {UPSTASH_REDIS_REST_TOKEN}"},
                json=["GET", cache_key]
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("result")
    except Exception as exc:
        logger.warning(f"Upstash cache read bypassed due to network error: {exc}")
    
    return None

async def set_upstash_cache(cache_key: str, value: str, ttl: int = CACHE_TTL_SECONDS) -> None:
    """
    Persists serialized JSON into Upstash Redis with a TTL using REST array syntax.
    """
    if not UPSTASH_REDIS_REST_URL or not UPSTASH_REDIS_REST_TOKEN:
        return

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                UPSTASH_REDIS_REST_URL,
                headers={"Authorization": f"Bearer {UPSTASH_REDIS_REST_TOKEN}"},
                json=["SET", cache_key, value, "EX", ttl]
            )
    except Exception as exc:
        logger.warning(f"Upstash cache write failed: {exc}")

# ---------------------------------------------------------
# Dependency: Database Pool
# ---------------------------------------------------------
async def get_db_pool(request: Request) -> asyncpg.Pool:
    """
    Retrieves the managed asyncpg connection pool from the FastAPI application state.
    """
    pool = getattr(request.app.state, "db_pool", None)
    if not pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection pool is uninitialized or unavailable."
        )
    return pool

# ---------------------------------------------------------
# Main Assistant Query Route (Phase 4.2 Egress Routing)
# ---------------------------------------------------------
@router.post(
    "/query",
    response_model=AssistantResponse,
    status_code=status.HTTP_200_OK,
    summary="Process Operator Query via Grounded RRF and Cerebras LLM"
)
async def handle_assistant_query(
    payload: GatewayQueryPayload,
    background_tasks: BackgroundTasks,
    db_pool: asyncpg.Pool = Depends(get_db_pool)
) -> AssistantResponse:
    """
    Egress boundary: Ingests request from Go Gateway, evaluates Upstash cache,
    executes PostgreSQL hybrid RRF search, delegates to Cerebras Llama 3.1 with
    Pydantic schema enforcement. Audit logging is deferred to the Go Gateway.
    """
    cache_key = generate_cache_key(payload)

    # 1. Option A: Check Upstash Redis Cache
    cached_json = await fetch_upstash_cache(cache_key)
    if cached_json:
        try:
            return AssistantResponse.model_validate_json(cached_json)
        except Exception as parse_error:
            logger.warning(f"Corrupted cache entry ignored: {parse_error}")

    # 2. Hybrid RRF Retrieval & Inference Pipeline
    try:
        # Fetch hybrid search context (Phase 3 Database RRF)
        retrieved_records = await retrieve_hybrid_context(
            pool=db_pool,
            query=payload.query,
            feeder_id=getattr(payload, "feeder_id", None),
            limit=5
        )

        # Assemble grounded prompt
        messages = assemble_prompt_context(payload, retrieved_records)

        # Execute constrained inference via Cerebras API with key rotation
        assistant_response = await generate_constrained_response(messages)

    except HTTPException:
        raise
    except Exception as pipeline_error:
        logger.error(f"Inference pipeline execution failed: {str(pipeline_error)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The sovereign assistant service encountered an error processing grid telemetry."
        )

    # 3. Cache the successful response asynchronously
    background_tasks.add_task(
        set_upstash_cache,
        cache_key=cache_key,
        value=assistant_response.model_dump_json()
    )

    # 4. Immediate Dispatch to Go Gateway
    return assistant_response