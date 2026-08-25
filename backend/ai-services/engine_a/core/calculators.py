import pandas as pd
from schemas.ingestion import OperationalPayload

def calculate_base_availability(df: pd.DataFrame, total_cycle_minutes: int = 1440) -> float:
    """
    Calculates the raw operational uptime ratio using a vectorized sum.
    
    By executing df['is_offline'].sum() directly in C via NumPy/Pandas, we entirely 
    eliminate Python-level loops, maximizing memory efficiency and speed.
    
    Args:
        df (pd.DataFrame): The aligned minute-by-minute temporal DataFrame.
        total_cycle_minutes (int): Total minutes in the 24-hour cycle.
        
    Returns:
        float: A pure mathematical ratio of uptime bounded between 0.0 and 1.0.
    """
    # Vectorized summation of all '1' flags (offline minutes)
    offline_minutes = df['is_offline'].sum()
    
    # Calculate pure uptime
    uptime_minutes = total_cycle_minutes - offline_minutes
    
    # Return boundary-protected ratio
    return max(0.0, uptime_minutes / total_cycle_minutes)

def calculate_duration_penalty(df: pd.DataFrame, severity_cap_minutes: float = 720.0) -> float:
    """
    Computes the fractional penalty for outage severity.
    
    This calculates how close the asset came to hitting the 720-minute severity cap
    established in Phase 1[cite: 1].
    
    Args:
        df (pd.DataFrame): The aligned telemetry DataFrame.
        severity_cap_minutes (float): The maximum penalty threshold.
        
    Returns:
        float: The duration penalty bounded strictly between 0.0 and 1.0.
    """
    offline_minutes = df['is_offline'].sum()
    
    # Mathematical bounding: if offline_minutes exceeds 720, the penalty is capped at 1.0
    return min(float(offline_minutes) / severity_cap_minutes, 1.0)

def calculate_frequency_volatility(payload: OperationalPayload, volatility_cap: float = 6.0) -> float:
    """
    Computes the fractional penalty for erratic grid behavior (volatility).
    
    This logic acts on the validated Pydantic model directly since counting discrete 
    events doesn't require temporal alignment[cite: 1].
    
    Args:
        payload (OperationalPayload): The boundary-validated telemetry data.
        volatility_cap (float): The maximum allowed frequency events before full penalty.
        
    Returns:
        float: The volatility penalty bounded strictly between 0.0 and 1.0.
    """
    event_count = len(payload.interruptions)
    
    # Mathematical bounding: 6 or more events yields a maximum penalty of 1.0
    return min(float(event_count) / volatility_cap, 1.0)