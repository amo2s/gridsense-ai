import pytest
from datetime import datetime, timezone
from schemas.ingestion import OperationalPayload, AssetMetadata, InterruptionRecord
from core.scoring_engine import evaluate_reliability

def get_complex_historical_payload() -> OperationalPayload:
    """
    Constructs a complex, multi-event payload to thoroughly exercise the mathematical 
    boundaries of the scoring engine.
    """
    return OperationalPayload(
        cycle_timestamp=datetime(2026, 8, 25, 0, 0, 0, tzinfo=timezone.utc),
        asset=AssetMetadata(
            feeder_id="FDR-003",
            voltage_class="33kV",
            capacity_mw=25.0
        ),
        interruptions=[
            InterruptionRecord(start_time=datetime(2026, 8, 25, 8, 0, 0, tzinfo=timezone.utc), duration_minutes=45.0),
            InterruptionRecord(start_time=datetime(2026, 8, 25, 14, 30, 0, tzinfo=timezone.utc), duration_minutes=30.0)
        ]
    )

def test_mathematical_determinism_and_parity():
    """
    Proves systemic reliability by passing the identical payload through the engine 
    1,000 times. Asserts that the calculated score is perfectly deterministic while 
    verifying via audit metadata that the engine is actually re-computing the math 
    and not just returning a cached response.
    """
    payload = get_complex_historical_payload()
    
    # Establish the baseline on the first execution
    baseline_result = evaluate_reliability(payload)
    
    # Verify baseline expectations mathematically
    # Total offline: 75 mins. 
    # Base Avail: (1440-75)/1440 = ~0.9479
    # Dur Penalty: 75/720 = ~0.1041
    # Freq Penalty: 2/6 = ~0.3333
    # Raw Score: (0.9479 * 100) - (0.1041 * 30) - (0.3333 * 20) = 94.79 - 3.123 - 6.666 = ~85.0
    assert baseline_result.reliability_score == 85
    assert baseline_result.risk_band == "STABLE"
    
    execution_latencies = []

    # High-volume iteration to test for floating-point drift or memory state leaks
    for _ in range(1000):
        current_result = evaluate_reliability(payload)
        
        # 1. Immutability Assertion: The metrics must never deviate from the baseline
        assert current_result.reliability_score == baseline_result.reliability_score
        assert current_result.risk_band == baseline_result.risk_band
        assert current_result.sub_scores.base_availability == baseline_result.sub_scores.base_availability
        assert current_result.sub_scores.duration_penalty == baseline_result.sub_scores.duration_penalty
        assert current_result.sub_scores.frequency_penalty == baseline_result.sub_scores.frequency_penalty
        
        # 2. Audit Delta Verification: Prove active execution by collecting latency micro-variations
        assert current_result.audit.calculation_latency_ms > 0.0
        execution_latencies.append(current_result.audit.calculation_latency_ms)

    # Prove that the latency varies, confirming active computation rather than caching
    unique_latencies = set(execution_latencies)
    assert len(unique_latencies) > 1, "Engine appears to be caching instead of computing."