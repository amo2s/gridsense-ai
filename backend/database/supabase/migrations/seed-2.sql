-- Clean up existing mock test data if necessary
DELETE FROM interruptions WHERE feeder_id IN ('FEEDER_TEST_01', 'FDR_JOS_CENTRAL_01');
DELETE FROM assets WHERE feeder_id IN ('FEEDER_TEST_01', 'FDR_JOS_CENTRAL_01');

-- 1. Insert Mock Grid Assets (Feeders)
INSERT INTO assets (
    feeder_id,
    voltage_class,
    capacity_mw,
    created_at
) VALUES 
(
    'FEEDER_TEST_01',
    '33kV',
    15.00,
    NOW() - INTERVAL '30 days'
),
(
    'FDR_JOS_CENTRAL_01',
    '11kV',
    7.50,
    NOW() - INTERVAL '60 days'
)
ON CONFLICT (feeder_id) DO UPDATE 
SET 
    voltage_class = EXCLUDED.voltage_class,
    capacity_mw = EXCLUDED.capacity_mw;

-- 2. Insert 24-Hour Telemetry Interruption Events for FEEDER_TEST_01
INSERT INTO interruptions (
    feeder_id,
    start_time,
    duration_minutes,
    created_at
) VALUES 
-- Outage 1: 14 hours ago (45 minutes duration)
(
    'FEEDER_TEST_01',
    NOW() - INTERVAL '14 hours',
    45.00,
    NOW() - INTERVAL '14 hours'
),
-- Outage 2: 6 hours ago (30 minutes duration)
(
    'FEEDER_TEST_01',
    NOW() - INTERVAL '6 hours',
    30.00,
    NOW() - INTERVAL '6 hours'
),
-- Outage 3: 2 hours ago (15 minutes duration)
(
    'FEEDER_TEST_01',
    NOW() - INTERVAL '2 hours',
    15.00,
    NOW() - INTERVAL '2 hours'
);