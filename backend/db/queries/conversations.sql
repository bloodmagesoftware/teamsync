-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

-- name: CreateConversation :one
INSERT INTO conversations (type, name, last_message_seq)
VALUES (?, ?, 0)
RETURNING *;

-- name: AddConversationParticipant :exec
INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
VALUES (?, ?, CURRENT_TIMESTAMP);

-- name: GetUserConversations :many
SELECT 
    c.*,
    crs.last_read_seq,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.seq > COALESCE(crs.last_read_seq, 0)) as unread_count
FROM conversations c
INNER JOIN conversation_participants cp ON c.id = cp.conversation_id
LEFT JOIN conversation_read_state crs ON c.id = crs.conversation_id AND crs.user_id = ?
WHERE cp.user_id = ?
ORDER BY c.last_message_seq DESC;

-- name: GetConversationByID :one
SELECT * FROM conversations WHERE id = ?;

-- name: GetConversationParticipants :many
SELECT u.id, u.username, u.profile_image_hash
FROM users u
INNER JOIN conversation_participants cp ON u.id = cp.user_id
WHERE cp.conversation_id = ?;

-- name: GetOrCreateDMConversation :one
SELECT c.* FROM conversations c
INNER JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
INNER JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
WHERE c.type = 'dm'
  AND cp1.user_id = ?
  AND cp2.user_id = ?
  AND (SELECT COUNT(*) FROM conversation_participants WHERE conversation_id = c.id) = 2
LIMIT 1;

-- name: UpdateConversationSeq :exec
UPDATE conversations 
SET last_message_seq = last_message_seq + 1
WHERE id = ?;

-- name: UpdateReadState :exec
INSERT INTO conversation_read_state (conversation_id, user_id, last_read_seq, last_read_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(conversation_id, user_id) 
DO UPDATE SET last_read_seq = excluded.last_read_seq, last_read_at = CURRENT_TIMESTAMP;
