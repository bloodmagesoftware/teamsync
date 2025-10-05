// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package api

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"
)

type Server struct {
	httpServer *http.Server
	db         *sql.DB
}

func New(db *sql.DB) *Server {
	s := &Server{
		db: db,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/hello", s.handleHello)

	s.httpServer = &http.Server{
		Addr:         "127.0.0.1:8080",
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s
}

func (s *Server) handleHello(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Hello, World!"))
}

func (s *Server) Start() error {
	log.Printf("starting API server on %s", s.httpServer.Addr)
	if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("failed to start server: %w", err)
	}
	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	log.Printf("shutting down API server")
	return s.httpServer.Shutdown(ctx)
}
