// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
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
	"github.com/chai2010/webp"
	"github.com/nfnt/resize"
)

type Server struct {
	httpServer *http.Server
	queries    *db.Queries
}

func New(queries *db.Queries) *Server {
	s := &Server{
		queries: queries,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/login", s.handleLogin)
	mux.HandleFunc("/api/auth/register", s.handleRegister)
	mux.Handle("/api/auth/me", auth.RequireAuth(queries)(http.HandlerFunc(s.handleMe)))
	mux.Handle("/api/invitations", auth.RequireAuth(queries)(http.HandlerFunc(s.handleInvitations)))
	mux.Handle("/api/invitations/delete", auth.RequireAuth(queries)(http.HandlerFunc(s.handleDeleteInvitation)))
	mux.Handle("/api/profile/image", auth.RequireAuth(queries)(http.HandlerFunc(s.handleProfileImageUpload)))
	mux.HandleFunc("/api/profile/image/", s.handleProfileImageServe)
	mux.Handle("/api/settings/chat", auth.RequireAuth(queries)(http.HandlerFunc(s.handleChatSettings)))
	mux.Handle("/api/conversations", auth.RequireAuth(queries)(http.HandlerFunc(s.handleConversations)))
	mux.Handle("/api/conversations/dm", auth.RequireAuth(queries)(http.HandlerFunc(s.handleGetOrCreateDM)))
	mux.Handle("/api/messages", auth.RequireAuth(queries)(http.HandlerFunc(s.handleMessages)))
	mux.Handle("/api/messages/send", auth.RequireAuth(queries)(http.HandlerFunc(s.handleSendMessage)))
	mux.Handle("/api/messages/read", auth.RequireAuth(queries)(http.HandlerFunc(s.handleUpdateReadState)))
	mux.Handle("/api/users/search", auth.RequireAuth(queries)(http.HandlerFunc(s.handleSearchUsers)))
	mux.Handle("/api/events/stream", auth.RequireAuth(queries)(http.HandlerFunc(s.handleEventStream)))

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
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
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
	Success         bool    `json:"success"`
	Message         string  `json:"message,omitempty"`
	UserID          int64   `json:"userId,omitempty"`
	Username        string  `json:"username,omitempty"`
	ProfileImageURL *string `json:"profileImageUrl,omitempty"`
	AccessToken     string  `json:"accessToken,omitempty"`
	RefreshToken    string  `json:"refreshToken,omitempty"`
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

	user, err := s.queries.GetUserByUsername(r.Context(), req.Username)
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

	if err := s.queries.DeleteUserTokens(r.Context(), user.ID); err != nil {
		log.Printf("warning: failed to delete old tokens: %v", err)
	}

	_, err = s.queries.CreateOAuthToken(r.Context(), user.ID, tokenPair.AccessToken, tokenPair.RefreshToken, tokenPair.AccessTokenExpiresAt, tokenPair.RefreshTokenExpiresAt)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	var profileImageURL *string
	if user.ProfileImageHash != nil {
		url := fmt.Sprintf("/api/profile/image/%s", *user.ProfileImageHash)
		profileImageURL = &url
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authResponse{
		Success:         true,
		UserID:          user.ID,
		Username:        user.Username,
		ProfileImageURL: profileImageURL,
		AccessToken:     tokenPair.AccessToken,
		RefreshToken:    tokenPair.RefreshToken,
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

	_, err := s.queries.GetInvitationByCode(r.Context(), req.InvitationCode)
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

	user, err := s.queries.CreateUser(r.Context(), req.Username, hash, salt)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Username already taken"})
		return
	}

	if err := s.queries.DeleteInvitationCode(r.Context(), req.InvitationCode); err != nil {
		log.Printf("warning: failed to delete invitation code: %v", err)
	}

	tokenPair, err := auth.GenerateTokenPair()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	_, err = s.queries.CreateOAuthToken(r.Context(), user.ID, tokenPair.AccessToken, tokenPair.RefreshToken, tokenPair.AccessTokenExpiresAt, tokenPair.RefreshTokenExpiresAt)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(authResponse{Success: false, Message: "Server error"})
		return
	}

	var profileImageURL *string
	if user.ProfileImageHash != nil {
		url := fmt.Sprintf("/api/profile/image/%s", *user.ProfileImageHash)
		profileImageURL = &url
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(authResponse{
		Success:         true,
		UserID:          user.ID,
		Username:        user.Username,
		ProfileImageURL: profileImageURL,
		AccessToken:     tokenPair.AccessToken,
		RefreshToken:    tokenPair.RefreshToken,
	})
}

type userResponse struct {
	ID              int64   `json:"id"`
	Username        string  `json:"username"`
	ProfileImageURL *string `json:"profileImageUrl"`
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

	user, err := s.queries.GetUser(r.Context(), userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var profileImageURL *string
	if user.ProfileImageHash != nil {
		url := fmt.Sprintf("/api/profile/image/%s", *user.ProfileImageHash)
		profileImageURL = &url
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userResponse{
		ID:              user.ID,
		Username:        user.Username,
		ProfileImageURL: profileImageURL,
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

	switch r.Method {
	case http.MethodGet:
		invitations, err := s.queries.ListInvitationsByUser(r.Context(), &userID)
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

		invitation, err := s.queries.CreateInvitationCode(r.Context(), code, &userID)
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

	if err := s.queries.DeleteInvitationById(r.Context(), req.ID, &userID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (s *Server) handleProfileImageUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "File too large"})
		return
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid file"})
		return
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid image format"})
		return
	}

	bounds := img.Bounds()
	size := bounds.Dx()
	if bounds.Dy() < size {
		size = bounds.Dy()
	}

	offsetX := (bounds.Dx() - size) / 2
	offsetY := (bounds.Dy() - size) / 2

	type SubImager interface {
		SubImage(r image.Rectangle) image.Image
	}

	croppedImg := img.(SubImager).SubImage(image.Rect(
		bounds.Min.X+offsetX,
		bounds.Min.Y+offsetY,
		bounds.Min.X+offsetX+size,
		bounds.Min.Y+offsetY+size,
	))

	targetSize := 512
	if size < targetSize {
		targetSize = size
	}

	resizedImg := resize.Resize(uint(targetSize), uint(targetSize), croppedImg, resize.Lanczos3)

	var buf bytes.Buffer
	if err := webp.Encode(&buf, resizedImg, &webp.Options{Lossless: false, Quality: 85}); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to process image"})
		return
	}

	imageData := buf.Bytes()
	hash := sha256.Sum256(imageData)
	hashStr := hex.EncodeToString(hash[:])

	if err := s.queries.UpdateUserProfileImage(r.Context(), imageData, &hashStr, userID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to save image"})
		return
	}

	profileImageURL := fmt.Sprintf("/api/profile/image/%s", hashStr)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"success":         "true",
		"profileImageUrl": profileImageURL,
	})
}

func (s *Server) handleProfileImageServe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	hash := strings.TrimPrefix(r.URL.Path, "/api/profile/image/")
	if hash == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	users, err := s.queries.ListUsers(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var imageData []byte
	for _, user := range users {
		if user.ProfileImageHash != nil && *user.ProfileImageHash == hash {
			imageData, err = s.queries.GetUserProfileImage(r.Context(), user.ID)
			if err != nil {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			break
		}
	}

	if len(imageData) == 0 {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("Cache-Control", "public, max-age=2592000")
	w.Write(imageData)
}

type chatSettingsResponse struct {
	EnterSendsMessage bool `json:"enterSendsMessage"`
}

type updateChatSettingsRequest struct {
	EnterSendsMessage bool `json:"enterSendsMessage"`
}

func (s *Server) handleChatSettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		settings, err := s.queries.GetUserSettings(r.Context(), userID)
		if err != nil {
			if err == sql.ErrNoRows {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(chatSettingsResponse{
					EnterSendsMessage: false,
				})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatSettingsResponse{
			EnterSendsMessage: settings.EnterSendsMessage,
		})

	case http.MethodPost:
		var req updateChatSettingsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		settings, err := s.queries.UpsertUserSettings(r.Context(), userID, req.EnterSendsMessage)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(chatSettingsResponse{
			EnterSendsMessage: settings.EnterSendsMessage,
		})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
