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
INSERT INTO invitation_codes (code) VALUES (?) RETURNING *;

-- name: GetInvitationByCode :one
SELECT * FROM invitation_codes WHERE code = ? LIMIT 1;

-- name: DeleteInvitationCode :exec
DELETE FROM invitation_codes WHERE code = ?;
