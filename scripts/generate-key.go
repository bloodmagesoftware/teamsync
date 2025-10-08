// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
)

func main() {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		fmt.Fprintf(os.Stderr, "Error generating key: %v\n", err)
		os.Exit(1)
	}

	encoded := base64.StdEncoding.EncodeToString(key)

	fmt.Println("Generated 256-bit AES key for TeamSync message encryption:")
	fmt.Println("==========================================")
	fmt.Println(encoded)
	fmt.Println("==========================================")
	fmt.Println()
	fmt.Println("Store this key securely and set it as the TEAMSYNC_ENCRYPTION_KEY environment variable.")
	fmt.Println("WARNING: Never commit this key to version control or share it publicly.")
	fmt.Println()
	fmt.Println("Example usage:")
	fmt.Printf("export TEAMSYNC_ENCRYPTION_KEY=\"%s\"\n", encoded)
}
