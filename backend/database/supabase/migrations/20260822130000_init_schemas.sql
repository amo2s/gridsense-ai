-- =========================================================================
-- PHASE 2: LOGICAL SCHEMA & FOUNDATIONAL SECURITY
-- =========================================================================

-- 1. Schema Isolation (Step 2.2 Blueprint Requirement)
CREATE SCHEMA IF NOT EXISTS auth_domain;
CREATE SCHEMA IF NOT EXISTS energy_domain;

-- 2. Extension Provisioning (Step 2.3 Blueprint Requirement)
-- Required for secure UUID primary key generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Required for advanced cryptographic hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;