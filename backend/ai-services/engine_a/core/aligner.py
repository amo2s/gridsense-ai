import pandas as pd
import numpy as np
from datetime import timedelta
from schemas.ingestion import OperationalPayload

def align_telemetry(payload: OperationalPayload) -> pd.DataFrame:
    """
    Transforms discrete interruption records into a continuous 1440-minute time-series DataFrame.
    
    This fulfills the gap mitigation requirement by establishing a baseline operational 
    state (online) for all missing intervals, mapping only the known anomalies (outages) 
    onto the timeline.
    
    Args:
        payload (OperationalPayload): The validated ingestion contract.
        
    Returns:
        pd.DataFrame: A memory-efficient DataFrame indexed by minute, ready for vectorized math.
    """
    # 1. Establish the temporal boundaries of the 24-hour cycle
    cycle_end = payload.cycle_timestamp
    # Subtracting 1439 minutes to ensure exactly 1440 rows ending at cycle_end
    cycle_start = cycle_end - timedelta(minutes=1439)

    # 2. Generate a continuous minute-by-minute temporal index
    timeline = pd.date_range(start=cycle_start, end=cycle_end, freq='min')

    # 3. Initialize the DataFrame with a default state of '0' (Online / Normal Operation)
    # Using np.uint8 maximizes memory efficiency for binary categorical states[cite: 1]
    df = pd.DataFrame(index=timeline, data={'is_offline': np.zeros(len(timeline), dtype=np.uint8)})

    # 4. Map the discrete interruption events onto the continuous index
    for record in payload.interruptions:
        outage_start = record.start_time
        # Determine when the outage resolved based on the duration
        outage_end = outage_start + timedelta(minutes=record.duration_minutes)
        if outage_end > cycle_end:
            outage_end = cycle_end
        
        # Vectorized assignment: Flag the specific vulnerability window as '1' (Offline)
        # Pandas handles the temporal alignment automatically via .loc slicing
        df.loc[outage_start:outage_end, 'is_offline'] = 1

    return df