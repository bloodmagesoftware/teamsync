// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package api

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

const profileImageDir = "./data/objects"

func ensureProfileImageDir() error {
	return os.MkdirAll(profileImageDir, 0755)
}

func getProfileImagePath(hash string) string {
	return filepath.Join(profileImageDir, hash)
}

func saveProfileImage(imageData []byte) (string, error) {
	if err := ensureProfileImageDir(); err != nil {
		return "", fmt.Errorf("failed to create profile image directory: %w", err)
	}

	hashBytes := sha256.Sum256(imageData)
	hash := base64.URLEncoding.EncodeToString(hashBytes[:])

	path := getProfileImagePath(hash)

	if _, err := os.Stat(path); err == nil {
		return hash, nil
	}

	if err := os.WriteFile(path, imageData, 0644); err != nil {
		return "", fmt.Errorf("failed to write profile image: %w", err)
	}

	return hash, nil
}

func loadProfileImage(hash string) ([]byte, error) {
	path := getProfileImagePath(hash)
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("profile image not found")
		}
		return nil, fmt.Errorf("failed to read profile image: %w", err)
	}
	return data, nil
}

func deleteProfileImage(hash string) error {
	path := getProfileImagePath(hash)
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("failed to delete profile image: %w", err)
	}
	return nil
}
