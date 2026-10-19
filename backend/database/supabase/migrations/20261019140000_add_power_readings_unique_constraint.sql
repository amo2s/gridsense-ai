-- Phase 9: Enforce temporal uniqueness for Engine C CQRS ingestion
-- Adds a composite unique constraint to safely support ON CONFLICT UPSERT operations.

ALTER TABLE power_readings
ADD CONSTRAINT power_readings_feeder_timestamp_key UNIQUE (feeder_id, timestamp);
