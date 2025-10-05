// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bloodmagesoftware/teamsync/api"
	"github.com/bloodmagesoftware/teamsync/db"
)

func main() {
	database, err := db.Init("teamsync.db")
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer db.Close()

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
