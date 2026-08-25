import time
from datetime import datetime, timedelta, timezone
from schemas.ingestion import OperationalPayload
from schemas.egress import (
    EgressPayload, RiskBand, Trajectory, 
    SubScoreMetrics, VulnerabilityWindow, AuditMetadata
)
from core.aligner import align_telemetry
from core.calculators import (
    calculate_base_availability,
    calculate_duration_penalty,
    calculate_frequency_volatility
)

# Immutable execution weights established in Phase 1.
# In a production environment, these can be dynamically loaded from config/scoring_weights.json
WEIGHT_BASE = 100.0             # Anchor multiplier for raw uptime
WEIGHT_DURATION_PENALTY = 30.0  # Max deduction for severity
WEIGHT_FREQUENCY_PENALTY = 20.0 # Max deduction for volatility

def evaluate_reliability(payload: OperationalPayload, previous_score: int = None) -> EgressPayload:
    """
    Central orchestrator for the deterministic reliability scoring engine[cite: 1].
    
    Args:
        payload (OperationalPayload): The boundary-validated telemetry data.
        previous_score (int, optional): The score from the preceding cycle to determine trajectory.
        
    Returns:
        EgressPayload: The standardized, immutable JSON payload for the Go Gateway.
    """
    # Start high-resolution timer for audit metadata
    start_time_ms = time.perf_counter()

    # 1. Temporal Alignment & Gap Mitigation[cite: 1]
    df = align_telemetry(payload)

    # 2. Sub-Score Execution[cite: 1]
    # Fetch pure mathematical fractions (0.0 to 1.0)
    base_avail = calculate_base_availability(df)
    dur_penalty = calculate_duration_penalty(df)
    freq_penalty = calculate_frequency_volatility(payload)

    # 3. Final Orchestration & Bounding[cite: 1]
    # Calculate raw score: anchor minus severity and volatility penalties
    raw_score = (base_avail * WEIGHT_BASE) - (dur_penalty * WEIGHT_DURATION_PENALTY) - (freq_penalty * WEIGHT_FREQUENCY_PENALTY)
    
    # Clamp strictly between 0 and 100 to guarantee deterministic boundaries[cite: 1]
    final_score = int(max(0, min(100, round(raw_score))))

    # 4. Risk Band Classification[cite: 1]
    if final_score >= 85:
        risk_band = RiskBand.STABLE
    elif final_score >= 65:
        risk_band = RiskBand.VULNERABLE
    elif final_score >= 40:
        risk_band = RiskBand.CRITICAL
    else:
        risk_band = RiskBand.FAILING

    # 5. Trajectory Logic
    trajectory = Trajectory.STABLE
    if previous_score is not None:
        if final_score > previous_score:
            trajectory = Trajectory.IMPROVING
        elif final_score < previous_score:
            trajectory = Trajectory.DETERIORATING

    # 6. Vulnerability Windows Extraction
    windows = []
    for record in payload.interruptions:
        windows.append(
            VulnerabilityWindow(
                start_time=record.start_time,
                end_time=record.start_time + timedelta(minutes=record.duration_minutes),
                severity_tag="OUTAGE_EVENT"
            )
        )

    # 7. Audit & Determinism Envelope[cite: 1]
    latency_ms = (time.perf_counter() - start_time_ms) * 1000.0

    return EgressPayload(
        feeder_id=payload.asset.feeder_id,
        reliability_score=final_score,
        risk_band=risk_band,
        trajectory=trajectory,
        sub_scores=SubScoreMetrics(
            base_availability=base_avail,
            duration_penalty=dur_penalty,
            frequency_penalty=freq_penalty
        ),
        vulnerability_windows=windows,
        audit=AuditMetadata(
            cycle_timestamp=datetime.now(timezone.utc),
            calculation_latency_ms=latency_ms,
            engine_version="v1.0.0"
        )
    )