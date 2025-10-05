-- name: GetUser :one
SELECT * FROM users
WHERE id = ? LIMIT 1;

-- name: ListUsers :many
SELECT * FROM users
ORDER BY username;

-- name: CreateUser :one
INSERT INTO users (username, email)
VALUES (?, ?)
RETURNING *;

-- name: DeleteUser :exec
DELETE FROM users
WHERE id = ?;
