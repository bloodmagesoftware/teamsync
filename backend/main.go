// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/bloodmagesoftware/teamsync/api"
	"github.com/bloodmagesoftware/teamsync/auth"
	"github.com/bloodmagesoftware/teamsync/db"
	"github.com/bloodmagesoftware/teamsync/rtc"
)

func main() {
	_ = os.MkdirAll("data", 0755)
	database, err := db.Init("data/teamsync.db")
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer func() {
		if err := database.Close(); err != nil {
			log.Printf("error during database shutdown: %v", err)
		} else {
			log.Printf("database shutdown successfully")
		}
	}()

	if err := ensureInitialInvitation(database); err != nil {
		log.Fatalf("failed to ensure initial invitation: %v", err)
	}

	turnConfig := rtc.Config{
		ListenAddress:  strings.TrimSpace(os.Getenv("TURN_LISTEN_ADDRESS")),
		Realm:          strings.TrimSpace(os.Getenv("TURN_REALM")),
		UsernamePrefix: strings.TrimSpace(os.Getenv("TURN_USERNAME_PREFIX")),
	}

	if relayEnv := strings.TrimSpace(os.Getenv("TURN_RELAY_IP")); relayEnv != "" {
		if ip := net.ParseIP(relayEnv); ip != nil {
			turnConfig.RelayAddress = ip
		} else {
			log.Printf("invalid TURN_RELAY_IP: %q", relayEnv)
		}
	}

	turnServer, err := rtc.NewServer(database, turnConfig, log.Default())
	if err != nil {
		log.Fatalf("failed to start TURN server: %v", err)
	}
	defer func() {
		if err := turnServer.Close(); err != nil {
			log.Printf("error during TURN shutdown: %v", err)
		} else {
			log.Printf("TURN shutdown successfully")
		}
	}()

	server := api.New(database, turnServer.Config())
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("error during server shutdown: %v", err)
		} else {
			log.Printf("server shutdown successfully")
		}
	}()

	go func() {
		if err := server.Start(); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	<-quit

	log.Printf("shutdown signal received")
}

func ensureInitialInvitation(queries *db.Queries) error {
	ctx := context.Background()

	count, err := queries.CountUsers(ctx)
	if err != nil {
		return fmt.Errorf("failed to count users: %w", err)
	}

	if count == 0 {
		code, err := auth.GenerateInvitationCode()
		if err != nil {
			return fmt.Errorf("failed to generate invitation code: %w", err)
		}

		_, err = queries.CreateInvitationCode(ctx, code, nil)
		if err != nil {
			return fmt.Errorf("failed to create invitation code: %w", err)
		}

		fmt.Printf("\n========================================\n")
		fmt.Printf("No users found. Initial invitation code:\n")
		fmt.Printf("http://localhost:8080/register?invite=%s\n", code)
		fmt.Printf("========================================\n\n")
	}

	return nil
}
