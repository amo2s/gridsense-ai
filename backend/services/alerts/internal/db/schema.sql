DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS operator_interventions CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Polymorphic Domain Tracking
    domain VARCHAR(50) NOT NULL,       
    entity_type VARCHAR(50) NOT NULL,  
    entity_id VARCHAR(255) NOT NULL,   
    feeder_id VARCHAR(255),            
    
    -- Alert Specifics
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    
    -- Advanced Context & Grouping
    metadata JSONB DEFAULT '{}'::jsonb,
    fingerprint VARCHAR(64) NOT NULL,  
    
    -- Lifecycle Tracking
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN', 
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID,
    resolved_at TIMESTAMPTZ,
    
    -- AI & Semantic Search
    search_text TEXT,
    embedding vector(1536) 
);

-- Indexes for high-performance querying
CREATE INDEX idx_alerts_domain_entity ON alerts(domain, entity_type, entity_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_fingerprint ON alerts(fingerprint);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX idx_alerts_embedding ON alerts USING hnsw (embedding vector_cosine_ops);

-- Step 9.2: Operator Intervention Telemetry for RL Feedback Loop
CREATE TABLE operator_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    feeder_id VARCHAR(255) NOT NULL,
    operator_id VARCHAR(255) NOT NULL,
    action_taken VARCHAR(128) NOT NULL,
    notes TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_interventions_feeder ON operator_interventions (feeder_id);
CREATE INDEX idx_operator_interventions_alert ON operator_interventions (alert_id);