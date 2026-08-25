from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import List

class AssetMetadata(BaseModel):
    """
    Validates the static metadata for the grid asset (feeder).
    """
    feeder_id: str = Field(..., description="Unique identifier for the grid asset")
    voltage_class: str = Field(..., description="Voltage classification of the asset")
    capacity_mw: float = Field(..., gt=0, description="Capacity in Megawatts, must be strictly positive")

class InterruptionRecord(BaseModel):
    """
    Validates individual interruption events within a cycle.
    """
    start_time: datetime = Field(..., description="Timestamp when the interruption began")
    duration_minutes: float = Field(
        ..., 
        ge=0.0, 
        le=720.0, 
        description="Duration of the outage in minutes. Capped at 720 (12 hours) per the severity threshold."
    )

class OperationalPayload(BaseModel):
    """
    Strict boundary contract for incoming telemetry data from the Go API Gateway.
    """
    cycle_timestamp: datetime = Field(..., description="The start timestamp of the 24-hour evaluation cycle")
    asset: AssetMetadata = Field(..., description="Metadata of the asset being evaluated")
    interruptions: List[InterruptionRecord] = Field(
        default_factory=list, 
        description="List of discrete interruption events during this cycle"
    )

    @field_validator('interruptions')
    def validate_frequency_cap(cls, v):
        """
        Enforces the volatility cap. Rejects payloads reporting more than 6 discrete outages.
        """
        if len(v) > 6:
            raise ValueError("Frequency marker exceeded: A maximum of 6 discrete outages are permitted per cycle.")
        return v
    
    @field_validator('interruptions')
    def validate_total_duration(cls, v):
        """
        Ensures the sum of all interruptions does not exceed the 1440 minutes in a 24-hour cycle.
        """
        total_duration = sum(record.duration_minutes for record in v)
        if total_duration > 1440:
            raise ValueError("Logical anomaly: Total interruption duration cannot exceed 1440 minutes in a 24-hour cycle.")
        return v