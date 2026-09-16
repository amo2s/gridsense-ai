-- name: CreateAlert :one
INSERT INTO alerts (
    domain, entity_type, entity_id, feeder_id, type, severity, message, metadata, fingerprint, embedding
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING *;

-- name: GetAlertByID :one
SELECT * FROM alerts
WHERE id = $1 LIMIT 1;

-- name: ListActiveAlerts :many
SELECT * FROM alerts
WHERE status = 'OPEN' OR status = 'ACKNOWLEDGED'
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: UpdateAlertStatus :one
UPDATE alerts
SET 
    status = $1,
    acknowledged_at = COALESCE($2, acknowledged_at),
    acknowledged_by = COALESCE($3, acknowledged_by),
    resolved_at = COALESCE($4, resolved_at)
WHERE id = $5
RETURNING *;

-- name: FindSimilarAlerts :many
SELECT * FROM alerts
WHERE embedding IS NOT NULL
ORDER BY embedding <-> $1
LIMIT $2;
