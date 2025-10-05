-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
-- name: CreateOAuthToken :one
INSERT INTO oauth_tokens (user_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: GetTokenByAccessToken :one
SELECT * FROM oauth_tokens WHERE access_token = ? LIMIT 1;

-- name: GetTokenByRefreshToken :one
SELECT * FROM oauth_tokens WHERE refresh_token = ? LIMIT 1;

-- name: DeleteToken :exec
DELETE FROM oauth_tokens WHERE access_token = ?;

-- name: DeleteUserTokens :exec
DELETE FROM oauth_tokens WHERE user_id = ?;

-- name: DeleteExpiredTokens :exec
DELETE FROM oauth_tokens WHERE access_token_expires_at < datetime('now');
