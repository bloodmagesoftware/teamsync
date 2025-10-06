// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/bloodmagesoftware/teamsync/db"
)

type contextKey string

const UserIDKey contextKey = "userID"

func RequireAuth(queries *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			accessToken := parts[1]

			token, err := queries.GetTokenByAccessToken(r.Context(), accessToken)
			if err != nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			if time.Now().After(token.AccessTokenExpiresAt) {
				http.Error(w, "Token expired", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), UserIDKey, token.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUserID(ctx context.Context) (int64, bool) {
	userID, ok := ctx.Value(UserIDKey).(int64)
	return userID, ok
}
