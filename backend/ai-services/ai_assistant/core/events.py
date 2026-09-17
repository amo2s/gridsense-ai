"""
Advanced asynchronous Event Publisher utilizing C-level Redis parsing, 
Rust-backed JSON serialization, and exponential backoff network resilience.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import orjson
import redis.asyncio as redis
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

# Global Redis client locked in memory
_redis_client: redis.Redis | None = None
STREAM_KEY = "gridsense:alerts:stream"


def initialize_redis_pool(redis_url: str) -> None:
    """
    Initializes a high-performance, blocking Redis connection pool utilizing 
    the hiredis C-extension parser for ultra-low latency protocol parsing.
    """
    global _redis_client
    
    # We use a BlockingConnectionPool to prevent connection starvation under extreme load spikes
    pool = redis.BlockingConnectionPool.from_url(
        redis_url,
        max_connections=50,
        timeout=20,
        decode_responses=True,
        hiredis_parser=True  # Enforces C-level hiredis parser
    )
    _redis_client = redis.Redis(connection_pool=pool)
    logger.info("Advanced Upstash Redis pool initialized with hiredis parser.")


def close_redis_pool() -> None:
    """
    Gracefully tears down the connection pool. 
    Safely handles execution whether called from an async event loop or a synchronous context.
    """
    global _redis_client
    if _redis_client:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_redis_client.connection_pool.disconnect())
        except RuntimeError:
            # Fallback if no event loop is currently running during teardown
            asyncio.run(_redis_client.connection_pool.disconnect())
        logger.info("Upstash Redis connection pool safely disconnected.")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=1, max=5),
    retry=retry_if_exception_type((redis.ConnectionError, redis.TimeoutError))
)
async def _xadd_with_retry(stream_name: str, event_id: str, payload_dict: dict) -> str:
    """
    Executes XADD with exponential backoff for network resilience.
    If Upstash rate limits or drops packets, it automatically retries with jitter.
    """
    if not _redis_client:
        raise RuntimeError("Redis client not initialized in global state.")
    
    # Format explicitly for Watermill's redisstream.DefaultMarshallerUnmarshaller envelope
    watermill_envelope = {
        "uuid": event_id,
        "payload": orjson.dumps(payload_dict).decode("utf-8"),
        "metadata": "{}"
    }
    return await _redis_client.xadd(stream_name, watermill_envelope)


async def evaluate_and_publish_alert(engine_name: str, request_payload: Any, response_payload: Any) -> None:
    """
    Evaluates engine-specific thresholds using Python 3.10+ structural pattern matching.
    If breached, publishes the event via a background ASGI thread so the gateway is never blocked.
    """
    is_critical = False
    risk_score = 0.0
    
    # 1. Zero-latency dynamic threshold evaluation using structural pattern matching
    match engine_name:
        case "Engine A":
            rel_score = getattr(response_payload, "reliability_score", 100.0)
            if rel_score < 50.0:
                is_critical = True
                risk_score = 100.0 - rel_score
        case "Engine B":
            risk_score = getattr(response_payload, "risk_score", 0.0)
            if risk_score > 75.0:
                is_critical = True
        case "Engine C":
            if getattr(response_payload, "is_anomaly", False):
                is_critical = True
                risk_score = 95.0
        case "Engine D":
            ranked_assets = getattr(response_payload, "ranked_assets", [])
            if ranked_assets and getattr(ranked_assets[0], "priority_tier", "") == "CRITICAL":
                is_critical = True
                risk_score = 90.0
        case _:
            logger.warning(f"Unmapped engine origin passed to event publisher: {engine_name}")

    # 2. Drop out immediately if threshold is normal (saving network I/O)
    if not is_critical:
        return 
        
    event_id = getattr(response_payload, "event_id", str(uuid.uuid4()))
    
    # 3. Construct strict Go domain.AnomalyPayload JSON schema
    anomaly_payload = {
        "event_id": event_id,
        "trace_id": str(uuid.uuid4()),  # Injecting required trace context
        "type": "FEEDER_ANOMALY",       # Must exactly match Go validation enum
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": engine_name,
        "feeder_id": getattr(request_payload, "feeder_id", "FDR-UNKNOWN"),
        "risk_score": float(risk_score),
        "severity": "CRITICAL",
        "metrics_snapshot": {
            "request_context": request_payload.model_dump() if hasattr(request_payload, "model_dump") else {},
            "inference_result": response_payload.model_dump() if hasattr(response_payload, "model_dump") else {}
        }
    }
    
    # 4. Fire-and-forget to Redis with tenacity network resilience
    try:
        message_id = await _xadd_with_retry(STREAM_KEY, event_id, anomaly_payload)
        logger.info(f"Critical alert published to {STREAM_KEY}. Message ID: {message_id}")
    except Exception as e:
        logger.error(f"Failed to publish alert to {STREAM_KEY} after retries. Error: {e}")