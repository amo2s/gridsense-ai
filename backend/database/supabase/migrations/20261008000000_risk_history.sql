-- Migration 20261008000000_risk_history.sql

CREATE TABLE IF NOT EXISTS risk_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id VARCHAR(255) NOT NULL,
    risk_value NUMERIC(5,2) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_grid_assets FOREIGN KEY (area_id) REFERENCES grid_assets(id) ON DELETE CASCADE,
    CONSTRAINT uq_risk_history UNIQUE (area_id, recorded_at)
);

COMMENT ON COLUMN risk_history.risk_value IS 'reliability score 0-100, higher = healthier';

CREATE INDEX IF NOT EXISTS idx_risk_history_recorded_at ON risk_history (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_history_area_time ON risk_history (area_id, recorded_at DESC);

ALTER TABLE risk_history ENABLE ROW LEVEL SECURITY;
