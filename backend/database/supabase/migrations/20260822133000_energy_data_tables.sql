-- =========================================================================
-- PHASE 4: ENERGY DATA & AI INTELLIGENCE MODELING
-- =========================================================================

-- 1. Devices / Smart Meters Table
CREATE TABLE IF NOT EXISTS energy_domain.devices (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    device_name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Time-Series Energy Ingestion Table
CREATE TABLE IF NOT EXISTS energy_domain.energy_readings (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES energy_domain.devices(id) ON DELETE CASCADE,
    voltage NUMERIC(6, 2) NOT NULL,
    current NUMERIC(6, 2) NOT NULL,
    power NUMERIC(8, 2) NOT NULL,
    energy_kwh NUMERIC(10, 4) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Data Validation Constraints (Reject anomalous sensor data)
    CONSTRAINT check_positive_voltage CHECK (voltage >= 0),
    CONSTRAINT check_positive_current CHECK (current >= 0),
    CONSTRAINT check_positive_power CHECK (power >= 0),
    CONSTRAINT check_positive_energy CHECK (energy_kwh >= 0)
);

-- 3. High-Speed Time-Series Query Indexes
CREATE INDEX IF NOT EXISTS idx_energy_readings_device_timestamp 
    ON energy_domain.energy_readings(device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_energy_readings_recorded_at 
    ON energy_domain.energy_readings(recorded_at DESC);