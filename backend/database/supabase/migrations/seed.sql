-- =========================================================================
-- PHASE 6: SYNTHETIC SEEDING & BASELINE DATA
-- =========================================================================

-- 1. Insert a baseline Admin account and a Pending user
-- Note: We use a dummy password hash here for testing. 
-- In a real scenario, use the /api/auth/register endpoint to generate proper Argon2id hashes.
INSERT INTO public.users (id, email, password_hash, role, status)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'admin@gridsense.com', 'dummy_hash_admin', 'Admin', 'Approved'),
    ('22222222-2222-2222-2222-222222222222', 'pending@gridsense.com', 'dummy_hash_user', 'Staff', 'Pending')
ON CONFLICT (email) DO NOTHING;

-- 2. Insert a synthetic Smart Meter device assigned to the Admin
INSERT INTO energy_domain.devices (id, user_id, device_name, location)
VALUES 
    ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Main Grid Meter', 'Substation Alpha')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert a batch of synthetic time-series energy data
INSERT INTO energy_domain.energy_readings (device_id, voltage, current, power, energy_kwh)
VALUES 
    ('33333333-3333-3333-3333-333333333333', 220.5, 10.2, 2249.10, 1500.2500),
    ('33333333-3333-3333-3333-333333333333', 221.0, 10.5, 2320.50, 1502.5000),
    ('33333333-3333-3333-3333-333333333333', 219.8, 9.8, 2154.04, 1504.6000);