// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bloodmagesoftware/teamsync/auth"
	"github.com/bloodmagesoftware/teamsync/db"
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
	mux.HandleFunc("/api/auth/login", s.handleLogin)
	mux.HandleFunc("/api/auth/register", s.handleRegister)
	mux.Handle("/api/auth/me", auth.RequireAuth(db)(http.HandlerFunc(s.handleMe)))
	mux.Handle("/api/invitations", auth.RequireAuth(db)(http.HandlerFunc(s.handleInvitations)))
	mux.Handle("/api/invitations/delete", auth.RequireAuth(db)(http.HandlerFunc(s.handleDeleteInvitation)))

	if frontendDevURL, ok := os.LookupEnv("FRONTEND_DEV_URL"); ok {
		log.Printf("development mode: proxying frontend requests to %s", frontendDevURL)
		mux.HandleFunc("/", s.handleDevProxy(frontendDevURL))
	} else {
		log.Printf("production mode: serving static files from ./public")
		mux.HandleFunc("/", s.handleStaticFiles())
	}

	s.httpServer = &http.Server{
		Addr:         "127.0.0.1:8080",
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s
}

func (s *Server) handleDevProxy(frontendURL string) http.HandlerFunc {
	target, err := url.Parse(frontendURL)
	if err != nil {
		log.Fatalf("invalid FRONTEND_DEV_URL: %v", err)
	}

	return func(w http.ResponseWriter, r *http.Request) {
		proxyURL := *target
		proxyURL.Path = r.URL.Path
		proxyURL.RawQuery = r.URL.RawQuery

		proxyReq, err := http.NewRequest(r.Method, proxyURL.String(), r.Body)
		if err != nil {
			http.Error(w, "proxy error", http.StatusInternalServerError)
			return
		}

		for key, values := range r.Header {
			for _, value := range values {
				proxyReq.Header.Add(key, value)
			}
		}

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(proxyReq)
		if err != nil {
			http.Error(w, "proxy error", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		for key, values := range resp.Header {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}

		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}

func (s *Server) handleStaticFiles() http.HandlerFunc {
	publicDir := "./public"
	fs := http.FileServer(http.Dir(publicDir))

	return func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(publicDir, r.URL.Path)

		_, err := os.Stat(path)
		if os.IsNotExist(err) {
			if !strings.HasPrefix(r.URL.Path, "/api/") {
				indexPath := filepath.Join(publicDir, "index.html")
				http.ServeFile(w, r, indexPath)
				return
			}
			http.NotFound(w, r)
			return
		}

		fs.ServeHTTP(w, r)
	}
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

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type registerRequest struct {
	Username       string `json:"username"`
	Password       string `json:"password"`
	InvitationCode string `json:"invitationCode"`
}

type authResponse struct {
	Success      bool   `json:"success"`
	Message      string `json:"message,omitempty"`
	UserID       int64  `json:"userId,omitempty"`
	Username     string `json:"username,omitempty"`
	AccessToken  string `json:"accessToken,omitempty"`
	RefreshToken string `json:"refreshToken,omitempty"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Invalid request"})
		return
	}

	queries := db.New(s.db)
	user, err := queries.GetUserByUsername(r.Context(), req.Username)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Invalid credentials"})
		return
	}

	valid, err := auth.VerifyPassword(req.Password, user.PasswordSalt, user.PasswordHash)
	if err != nil || !valid {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Invalid credentials"})
		return
	}

	tokenPair, err := auth.GenerateTokenPair()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	if err := queries.DeleteUserTokens(r.Context(), user.ID); err != nil {
		log.Printf("warning: failed to delete old tokens: %v", err)
	}

	_, err = queries.CreateOAuthToken(r.Context(), user.ID, tokenPair.AccessToken, tokenPair.RefreshToken, tokenPair.AccessTokenExpiresAt, tokenPair.RefreshTokenExpiresAt)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authResponse{
		Success:      true,
		UserID:       user.ID,
		Username:     user.Username,
		AccessToken:  tokenPair.AccessToken,
		RefreshToken: tokenPair.RefreshToken,
	})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Invalid request"})
		return
	}

	queries := db.New(s.db)

	_, err := queries.GetInvitationByCode(r.Context(), req.InvitationCode)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Invalid invitation code"})
		return
	}

	salt, err := auth.GenerateSalt()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	hash, err := auth.HashPassword(req.Password, salt)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	user, err := queries.CreateUser(r.Context(), req.Username, hash, salt)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Username already taken"})
		return
	}

	if err := queries.DeleteInvitationCode(r.Context(), req.InvitationCode); err != nil {
		log.Printf("warning: failed to delete invitation code: %v", err)
	}

	tokenPair, err := auth.GenerateTokenPair()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	_, err = queries.CreateOAuthToken(r.Context(), user.ID, tokenPair.AccessToken, tokenPair.RefreshToken, tokenPair.AccessTokenExpiresAt, tokenPair.RefreshTokenExpiresAt)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authResponse{
		Success:      true,
		UserID:       user.ID,
		Username:     user.Username,
		AccessToken:  tokenPair.AccessToken,
		RefreshToken: tokenPair.RefreshToken,
	})
}

type userResponse struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	queries := db.New(s.db)
	user, err := queries.GetUser(r.Context(), userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userResponse{
		ID:       user.ID,
		Username: user.Username,
	})
}

type invitationResponse struct {
	ID        int64  `json:"id"`
	Code      string `json:"code"`
	CreatedAt string `json:"createdAt"`
}

func (s *Server) handleInvitations(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	queries := db.New(s.db)

	switch r.Method {
	case http.MethodGet:
		invitations, err := queries.ListInvitationsByUser(r.Context(), &userID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		response := make([]invitationResponse, len(invitations))
		for i, inv := range invitations {
			response[i] = invitationResponse{
				ID:        inv.ID,
				Code:      inv.Code,
				CreatedAt: inv.CreatedAt.Format(time.RFC3339),
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)

	case http.MethodPost:
		code, err := auth.GenerateInvitationCode()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		invitation, err := queries.CreateInvitationCode(r.Context(), code, &userID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(invitationResponse{
			ID:        invitation.ID,
			Code:      invitation.Code,
			CreatedAt: invitation.CreatedAt.Format(time.RFC3339),
		})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

type deleteInvitationRequest struct {
	ID int64 `json:"id"`
}

func (s *Server) handleDeleteInvitation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req deleteInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	queries := db.New(s.db)
	if err := queries.DeleteInvitationById(r.Context(), req.ID, &userID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
