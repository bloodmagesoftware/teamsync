// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/argon2"
)

const (
	saltSize    = 16
	hashMemory  = 64 * 1024
	hashTime    = 3
	hashThreads = 2
	hashKeyLen  = 32
)

func GenerateSalt() (string, error) {
	salt := make([]byte, saltSize)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("failed to generate salt: %w", err)
	}
	return base64.StdEncoding.EncodeToString(salt), nil
}

func HashPassword(password, salt string) (string, error) {
	saltBytes, err := base64.StdEncoding.DecodeString(salt)
	if err != nil {
		return "", fmt.Errorf("failed to decode salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), saltBytes, hashTime, hashMemory, hashThreads, hashKeyLen)
	return base64.StdEncoding.EncodeToString(hash), nil
}

func VerifyPassword(password, salt, hash string) (bool, error) {
	computedHash, err := HashPassword(password, salt)
	if err != nil {
		return false, err
	}

	hashBytes, err := base64.StdEncoding.DecodeString(hash)
	if err != nil {
		return false, fmt.Errorf("failed to decode hash: %w", err)
	}

	computedHashBytes, err := base64.StdEncoding.DecodeString(computedHash)
	if err != nil {
		return false, fmt.Errorf("failed to decode computed hash: %w", err)
	}

	return subtle.ConstantTimeCompare(hashBytes, computedHashBytes) == 1, nil
}

func GenerateInvitationCode() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate invitation code: %w", err)
	}
	return base64.URLEncoding.EncodeToString(bytes), nil
}
