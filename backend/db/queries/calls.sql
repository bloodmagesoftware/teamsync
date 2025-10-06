-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

-- name: CreateCall :one
INSERT INTO calls (conversation_id, message_id, created_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
RETURNING *;

-- name: GetCallByMessageID :one
SELECT * FROM calls WHERE message_id = ? AND deleted_at IS NULL;

-- name: GetCallByID :one
SELECT * FROM calls WHERE id = ? AND deleted_at IS NULL;

-- name: EndCall :exec
UPDATE calls 
SET ended_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- name: GetActiveCallByConversation :one
SELECT * FROM calls 
WHERE conversation_id = ? AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 1;
