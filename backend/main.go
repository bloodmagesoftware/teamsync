// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bloodmagesoftware/teamsync/api"
	"github.com/bloodmagesoftware/teamsync/auth"
	"github.com/bloodmagesoftware/teamsync/db"
)

func main() {
	database, err := db.Init("teamsync.db")
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer db.Close()

	if err := ensureInitialInvitation(database); err != nil {
		log.Fatalf("failed to ensure initial invitation: %v", err)
	}

	server := api.New(database)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("error during server shutdown: %v", err)
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

func ensureInitialInvitation(database *sql.DB) error {
	ctx := context.Background()
	queries := db.New(database)

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
