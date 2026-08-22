-- =========================================================================
-- PHASE 3: AUTHENTICATION DATA MODELING
-- =========================================================================

-- Create custom enum types for roles and account statuses
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Staff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE account_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the core users table (in public schema for Go backend compatibility)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Staff',
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index frequently queried columns
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);