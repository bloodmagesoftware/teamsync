-- name: GetUser :one
SELECT * FROM users
WHERE id = ? LIMIT 1;

-- name: ListUsers :many
SELECT * FROM users
ORDER BY username;

-- name: CreateUser :one
INSERT INTO users (username, password_hash, password_salt)
VALUES (?, ?, ?)
RETURNING *;

-- name: DeleteUser :exec
DELETE FROM users
WHERE id = ?;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = ? LIMIT 1;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: CreateInvitationCode :one
INSERT INTO invitation_codes (code, created_by) VALUES (?, ?) RETURNING *;

-- name: GetInvitationByCode :one
SELECT * FROM invitation_codes WHERE code = ? LIMIT 1;

-- name: DeleteInvitationCode :exec
DELETE FROM invitation_codes WHERE code = ?;

-- name: ListInvitationsByUser :many
SELECT * FROM invitation_codes WHERE created_by = ? ORDER BY created_at DESC;

-- name: DeleteInvitationById :exec
DELETE FROM invitation_codes WHERE id = ? AND created_by = ?;

-- name: UpdateUserProfileImage :exec
UPDATE users SET profile_image = ?, profile_image_hash = ? WHERE id = ?;

-- name: GetUserProfileImage :one
SELECT profile_image FROM users WHERE id = ? LIMIT 1;

-- name: SearchUsers :many
SELECT id, username, profile_image_hash FROM users 
WHERE username LIKE ? AND id != ?
ORDER BY username
LIMIT 10;
