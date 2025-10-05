// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package auth

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"
)

const (
	accessTokenLength  = 32
	refreshTokenLength = 32
	accessTokenTTL     = 24 * time.Hour
	refreshTokenTTL    = 30 * 24 * time.Hour
)

type TokenPair struct {
	AccessToken           string
	RefreshToken          string
	AccessTokenExpiresAt  time.Time
	RefreshTokenExpiresAt time.Time
}

func GenerateTokenPair() (*TokenPair, error) {
	accessToken, err := generateToken(accessTokenLength)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, err := generateToken(refreshTokenLength)
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token: %w", err)
	}

	now := time.Now()
	return &TokenPair{
		AccessToken:           accessToken,
		RefreshToken:          refreshToken,
		AccessTokenExpiresAt:  now.Add(accessTokenTTL),
		RefreshTokenExpiresAt: now.Add(refreshTokenTTL),
	}, nil
}

func generateToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(bytes), nil
}
