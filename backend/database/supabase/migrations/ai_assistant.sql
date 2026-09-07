-- 1. anomalies
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS search_text tsvector;
CREATE INDEX IF NOT EXISTS idx_anomalies_embedding ON anomalies USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_anomalies_search_text ON anomalies USING gin (search_text);

-- 2. outage_events
ALTER TABLE outage_events ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE outage_events ADD COLUMN IF NOT EXISTS search_text tsvector;
CREATE INDEX IF NOT EXISTS idx_outage_events_embedding ON outage_events USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_outage_events_search_text ON outage_events USING gin (search_text);

-- 3. risk_predictions
ALTER TABLE risk_predictions ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE risk_predictions ADD COLUMN IF NOT EXISTS search_text tsvector;
CREATE INDEX IF NOT EXISTS idx_risk_predictions_embedding ON risk_predictions USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_risk_predictions_search_text ON risk_predictions USING gin (search_text);

-- 4. fault_events
ALTER TABLE fault_events ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE fault_events ADD COLUMN IF NOT EXISTS search_text tsvector;
CREATE INDEX IF NOT EXISTS idx_fault_events_embedding ON fault_events USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_fault_events_search_text ON fault_events USING gin (search_text);

-- 5. intervention_outcomes
ALTER TABLE intervention_outcomes ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE intervention_outcomes ADD COLUMN IF NOT EXISTS search_text tsvector;
CREATE INDEX IF NOT EXISTS idx_intervention_outcomes_embedding ON intervention_outcomes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_intervention_outcomes_search_text ON intervention_outcomes USING gin (search_text);

-- 6. alerts
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS search_text tsvector;
CREATE INDEX IF NOT EXISTS idx_alerts_embedding ON alerts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_alerts_search_text ON alerts USING gin (search_text);