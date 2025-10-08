// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"

	"github.com/awnumar/memguard"
)

var (
	encryptor         *MessageEncryptor
	encryptorOnce     sync.Once
	ErrNotInitialized = errors.New("encryption not initialized")
)

type MessageEncryptor struct {
	key    *memguard.Enclave
	cipher cipher.AEAD
	mu     sync.RWMutex
}

func InitializeEncryption() error {
	var initErr error
	encryptorOnce.Do(func() {
		keyBase64 := os.Getenv("TEAMSYNC_ENCRYPTION_KEY")
		if keyBase64 == "" {
			initErr = errors.New("TEAMSYNC_ENCRYPTION_KEY environment variable not set")
			return
		}

		keyBytes, err := base64.StdEncoding.DecodeString(keyBase64)
		if err != nil {
			initErr = fmt.Errorf("failed to decode encryption key: %w", err)
			return
		}

		if len(keyBytes) != 32 {
			initErr = errors.New("encryption key must be 32 bytes (256 bits)")
			return
		}

		enclave := memguard.NewEnclave(keyBytes)

		memguard.WipeBytes(keyBytes)

		lockedBuffer, err := enclave.Open()
		if err != nil {
			initErr = fmt.Errorf("failed to open enclave: %w", err)
			return
		}
		defer lockedBuffer.Destroy()

		block, err := aes.NewCipher(lockedBuffer.Bytes())
		if err != nil {
			initErr = fmt.Errorf("failed to create cipher: %w", err)
			return
		}

		gcm, err := cipher.NewGCM(block)
		if err != nil {
			initErr = fmt.Errorf("failed to create GCM: %w", err)
			return
		}

		encryptor = &MessageEncryptor{
			key:    enclave,
			cipher: gcm,
		}
	})

	return initErr
}

func EncryptMessage(plaintext string, conversationID int64) (string, error) {
	if encryptor == nil {
		return "", ErrNotInitialized
	}

	encryptor.mu.RLock()
	defer encryptor.mu.RUnlock()

	nonce := make([]byte, encryptor.cipher.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	additionalData := []byte(fmt.Sprintf("conv:%d", conversationID))

	ciphertext := encryptor.cipher.Seal(nonce, nonce, []byte(plaintext), additionalData)

	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func DecryptMessage(ciphertext string, conversationID int64) (string, error) {
	if encryptor == nil {
		return "", ErrNotInitialized
	}

	encryptor.mu.RLock()
	defer encryptor.mu.RUnlock()

	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	nonceSize := encryptor.cipher.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce := data[:nonceSize]
	ciphertextBytes := data[nonceSize:]

	additionalData := []byte(fmt.Sprintf("conv:%d", conversationID))

	plaintext, err := encryptor.cipher.Open(nil, nonce, ciphertextBytes, additionalData)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt: %w", err)
	}

	return string(plaintext), nil
}

func IsEncrypted(text string) bool {
	_, err := base64.StdEncoding.DecodeString(text)
	return err == nil && len(text) > 24
}

func Shutdown() {
	if encryptor != nil && encryptor.key != nil {
		encryptor.key = nil
		encryptor = nil
	}
}
