-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

-- name: CreateMessage :one
INSERT INTO messages (conversation_id, seq, sender_id, content_type, body, reply_to_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
RETURNING *;

-- name: GetConversationMessages :many
SELECT 
    m.*,
    u.username as sender_username,
    u.profile_image_hash as sender_profile_image_hash
FROM messages m
INNER JOIN users u ON m.sender_id = u.id
WHERE m.conversation_id = ? AND m.deleted_at IS NULL
ORDER BY m.seq DESC
LIMIT ? OFFSET ?;

-- name: GetMessageByID :one
SELECT * FROM messages WHERE id = ?;

-- name: UpdateMessage :exec
UPDATE messages 
SET body = ?, edited_at = CURRENT_TIMESTAMP
WHERE id = ? AND sender_id = ? AND deleted_at IS NULL;

-- name: DeleteMessage :exec
UPDATE messages 
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = ? AND sender_id = ?;

-- name: AddMessageAttachment :exec
INSERT INTO message_attachments (message_id, attachment_id, filename, mime_type, size_bytes)
VALUES (?, ?, ?, ?, ?);

-- name: GetMessageAttachments :many
SELECT * FROM message_attachments WHERE message_id = ?;
