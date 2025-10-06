-- name: GetUserSettings :one
SELECT * FROM user_settings WHERE user_id = ? LIMIT 1;

-- name: CreateUserSettings :one
INSERT INTO user_settings (user_id, enter_sends_message, markdown_enabled)
VALUES (?, ?, ?)
RETURNING *;

-- name: UpdateEnterSendsMessage :exec
UPDATE user_settings SET enter_sends_message = ? WHERE user_id = ?;

-- name: UpdateMarkdownEnabled :exec
UPDATE user_settings SET markdown_enabled = ? WHERE user_id = ?;

-- name: UpsertUserSettings :one
INSERT INTO user_settings (user_id, enter_sends_message, markdown_enabled)
VALUES (?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET 
    enter_sends_message = excluded.enter_sends_message,
    markdown_enabled = excluded.markdown_enabled
RETURNING *;
