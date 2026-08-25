-- backend/database/001_initial_schema.sql

-- 1. Assets Table: Stores physical grid infrastructure
CREATE TABLE assets (
    feeder_id VARCHAR(50) PRIMARY KEY,
    voltage_class VARCHAR(20) NOT NULL,
    capacity_mw NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Interruptions Table: Tracks discrete outage events
CREATE TABLE interruptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feeder_id VARCHAR(50) NOT NULL REFERENCES assets(feeder_id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    duration_minutes NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Performance Index: Optimizes the Gateway's queries when fetching the 24-hour cycle
CREATE INDEX idx_interruptions_feeder_time ON interruptions (feeder_id, start_time DESC);