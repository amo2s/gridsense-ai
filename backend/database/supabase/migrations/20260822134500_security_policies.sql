-- =========================================================================
-- PHASE 5: ROW-LEVEL SECURITY (RLS) - ROLE-SPECIFIC POLICIES
-- =========================================================================

-- Enable RLS across all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_domain.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_domain.energy_readings ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies
DROP POLICY IF EXISTS "Admins can do everything on users" ON public.users;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all devices" ON energy_domain.devices;
DROP POLICY IF EXISTS "Users can manage own devices" ON energy_domain.devices;
DROP POLICY IF EXISTS "Admins can read all energy data" ON energy_domain.energy_readings;
DROP POLICY IF EXISTS "Users can read own device data" ON energy_domain.energy_readings;

-- -------------------------------------------------------------------------
-- USERS TABLE POLICIES
-- -------------------------------------------------------------------------

-- 1. Full Admin control
CREATE POLICY "Admins have full user access" ON public.users
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'Admin')
    );

-- 2. Managers can view all user profiles
CREATE POLICY "Managers can view all users" ON public.users
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'Manager')
    );

-- 3. Managers can update user statuses (Approve/Reject), but cannot delete users
CREATE POLICY "Managers can update user status" ON public.users
    FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'Manager')
    );

-- 4. Staff can only view their own user profile
CREATE POLICY "Staff can view own profile" ON public.users
    FOR SELECT
    USING (id = auth.uid());

-- -------------------------------------------------------------------------
-- DEVICES TABLE POLICIES
-- -------------------------------------------------------------------------

-- 1. Admins and Managers have full oversight on all grid devices
CREATE POLICY "Admins and Managers manage all devices" ON energy_domain.devices
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() AND users.role IN ('Admin', 'Manager')
        )
    );

-- 2. Staff can only access devices explicitly assigned to their User ID
CREATE POLICY "Staff manage assigned devices" ON energy_domain.devices
    FOR ALL
    USING (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- ENERGY READINGS TABLE POLICIES
-- -------------------------------------------------------------------------

-- 1. Admins and Managers can inspect all time-series telemetry
CREATE POLICY "Admins and Managers view all energy data" ON energy_domain.energy_readings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() AND users.role IN ('Admin', 'Manager')
        )
    );

-- 2. Staff can only read telemetry emitted by their assigned devices
CREATE POLICY "Staff view assigned device energy data" ON energy_domain.energy_readings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM energy_domain.devices 
            WHERE devices.id = energy_readings.device_id 
            AND devices.user_id = auth.uid()
        )
    );