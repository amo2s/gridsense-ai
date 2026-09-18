import os
import json
import hashlib
import logging
import uuid
from typing import List, Dict, Any, Optional
import httpx
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request

from schemas.assistant_contracts import GatewayQueryPayload, AssistantResponse
from orchestrator.context_assembler import assemble_prompt_context, generate_constrained_response
from retrieval.hybrid_search import execute_hybrid_search
from retrieval.embedding_pipeline import EmbeddingPipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assistant", tags=["Assistant"])

# Single shared pipeline instance (holds the HF inference client)
_embedding_pipeline = EmbeddingPipeline()

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
    feeder_id = getattr(payload, "feeder_id", "global") or "global"
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
    Egress boundary: Ingests request from Go Gateway, resolves optional feeder context,
    executes PostgreSQL hybrid RRF search, and delegates to Cerebras Llama 3.1 
    with domain-constrained LLM guards.
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
        # Generate the query embedding via the shared EmbeddingPipeline
        query_embedding = await _embedding_pipeline.get_embedding(payload.query)

        # Context Variables
        resolved_feeder_id = None
        feeder_status = "global"
        feeder_suggestions = []

        async with db_pool.acquire() as conn:
            # --- Feeder Resolution Guardrail ---
            raw_feeder = payload.feeder_id.strip() if payload.feeder_id else None
            
            if raw_feeder:
                try:
                    # Attempt safe UUID parse; if valid, query exact match
                    uuid_val = uuid.UUID(raw_feeder)
                    row = await conn.fetchrow("SELECT id::text FROM feeders WHERE id = $1", uuid_val)
                    if row:
                        resolved_feeder_id = row["id"]
                        feeder_status = "resolved_exact"
                    else:
                        feeder_status = "not_found"
                except ValueError:
                    # If not a UUID, try a fuzzy match by name or string ID
                    try:
                        rows = await conn.fetch(
                            "SELECT id::text, name FROM feeders WHERE name ILIKE $1 OR id::text ILIKE $1 LIMIT 3",
                            f"%{raw_feeder}%"
                        )
                        if len(rows) == 1:
                            resolved_feeder_id = rows[0]["id"]
                            feeder_status = "resolved_fuzzy"
                        elif len(rows) > 1:
                            feeder_status = "multiple_matches"
                            feeder_suggestions = [{"id": r["id"], "name": r.get("name", "Unknown")} for r in rows]
                        else:
                            feeder_status = "not_found"
                    except Exception as e:
                        logger.warning(f"Fuzzy feeder lookup failed, bypassing constraint: {e}")
                        feeder_status = "unverified"
                        resolved_feeder_id = raw_feeder

            # --- Execute Hybrid Search ---
            # If the feeder was totally invalid, we bypass hybrid search to save DB cycles and rely on the guardrail
            retrieved_records = []
            if feeder_status in ["global", "resolved_exact", "resolved_fuzzy", "unverified"]:
                retrieved_records = await execute_hybrid_search(
                    conn=conn,
                    feeder_id=resolved_feeder_id,
                    query_text=payload.query,
                    query_embedding=query_embedding,
                    limit=5
                )

        # 3. Assemble grounded prompt with domain guardrails injected
        messages = assemble_prompt_context(
            payload=payload, 
            retrieved_records=retrieved_records,
            feeder_status=feeder_status,
            feeder_suggestions=feeder_suggestions
        )

        # 4. Execute constrained inference via Cerebras API with key rotation
        assistant_response = await generate_constrained_response(messages)

    except HTTPException:
        raise
    except Exception as pipeline_error:
        logger.error(f"Inference pipeline execution failed: {str(pipeline_error)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The sovereign assistant service encountered an error processing grid telemetry."
        )

    # 5. Cache the successful response asynchronously (only if it wasn't a guardrail correction)
    if feeder_status in ["global", "resolved_exact", "resolved_fuzzy"]:
        background_tasks.add_task(
            set_upstash_cache,
            cache_key=cache_key,
            value=assistant_response.model_dump_json()
        )

    # 6. Immediate Dispatch to Go Gateway
    return assistant_response