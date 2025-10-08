// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bloodmagesoftware/teamsync/auth"
	"github.com/bloodmagesoftware/teamsync/crypto"
)

type conversationResponse struct {
	ID             int64   `json:"id"`
	Type           string  `json:"type"`
	Name           *string `json:"name"`
	LastMessageSeq int64   `json:"lastMessageSeq"`
	UnreadCount    int64   `json:"unreadCount"`
	OtherUser      *struct {
		ID              int64   `json:"id"`
		Username        string  `json:"username"`
		ProfileImageURL *string `json:"profileImageUrl"`
	} `json:"otherUser,omitempty"`
}

type messageResponse struct {
	ID                    int64   `json:"id"`
	ConversationID        int64   `json:"conversationId"`
	Seq                   int64   `json:"seq"`
	SenderID              int64   `json:"senderId"`
	SenderUsername        string  `json:"senderUsername"`
	SenderProfileImageURL *string `json:"senderProfileImageUrl"`
	CreatedAt             string  `json:"createdAt"`
	EditedAt              *string `json:"editedAt,omitempty"`
	ContentType           string  `json:"contentType"`
	Body                  string  `json:"body"`
	ReplyToID             *int64  `json:"replyToId,omitempty"`
}

type sendMessageRequest struct {
	ConversationID int64  `json:"conversationId,omitempty"`
	OtherUserID    *int64 `json:"otherUserId,omitempty"`
	Body           string `json:"body"`
	ReplyToID      *int64 `json:"replyToId,omitempty"`
}

type updateReadStateRequest struct {
	ConversationID int64 `json:"conversationId"`
	LastReadSeq    int64 `json:"lastReadSeq"`
}

type userSearchResult struct {
	ID              int64   `json:"id"`
	Username        string  `json:"username"`
	ProfileImageURL *string `json:"profileImageUrl"`
}

type getOrCreateDMRequest struct {
	OtherUserID int64 `json:"otherUserId"`
}

func (s *Server) handleConversations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	conversations, err := s.queries.GetUserConversations(r.Context(), userID, userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	response := make([]conversationResponse, 0, len(conversations))
	for _, conv := range conversations {
		resp := conversationResponse{
			ID:             conv.ID,
			Type:           conv.Type,
			Name:           conv.Name,
			LastMessageSeq: conv.LastMessageSeq,
			UnreadCount:    conv.UnreadCount,
		}

		if conv.Type == "dm" {
			participants, err := s.queries.GetConversationParticipants(r.Context(), conv.ID)
			if err == nil {
				for _, p := range participants {
					if p.ID != userID {
						var profileImageURL *string
						if p.ProfileImageHash != nil {
							url := fmt.Sprintf("/api/profile/image/%s", *p.ProfileImageHash)
							profileImageURL = &url
						}
						resp.OtherUser = &struct {
							ID              int64   `json:"id"`
							Username        string  `json:"username"`
							ProfileImageURL *string `json:"profileImageUrl"`
						}{
							ID:              p.ID,
							Username:        p.Username,
							ProfileImageURL: profileImageURL,
						}
						break
					}
				}
			}
		}

		response = append(response, resp)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	conversationIDStr := r.URL.Query().Get("conversationId")
	if conversationIDStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	conversationID, err := strconv.ParseInt(conversationIDStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	participants, err := s.queries.GetConversationParticipants(r.Context(), conversationID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	isParticipant := false
	for _, p := range participants {
		if p.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	sinceStr := r.URL.Query().Get("since")
	beforeStr := r.URL.Query().Get("before")

	limitStr := r.URL.Query().Get("limit")
	limit := int64(50)
	if limitStr != "" {
		if parsedLimit, err := strconv.ParseInt(limitStr, 10, 64); err == nil {
			limit = parsedLimit
		}
	}

	var response []messageResponse

	if sinceStr != "" {
		sinceTime, err := time.Parse(time.RFC3339, sinceStr)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		msgs, err := s.queries.GetMessagesSince(r.Context(), conversationID, sinceTime)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		response = make([]messageResponse, len(msgs))
		for i, msg := range msgs {
			response[i] = s.convertToMessageResponse(msg.ID, msg.ConversationID, msg.Seq, msg.SenderID,
				msg.SenderUsername, msg.SenderProfileImageHash, msg.CreatedAt, msg.EditedAt,
				msg.ContentType, msg.Body, msg.ReplyToID)
		}
	} else if beforeStr != "" {
		beforeTime, err := time.Parse(time.RFC3339, beforeStr)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		msgs, err := s.queries.GetMessagesBefore(r.Context(), conversationID, beforeTime, limit)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		response = make([]messageResponse, len(msgs))
		for i, msg := range msgs {
			response[i] = s.convertToMessageResponse(msg.ID, msg.ConversationID, msg.Seq, msg.SenderID,
				msg.SenderUsername, msg.SenderProfileImageHash, msg.CreatedAt, msg.EditedAt,
				msg.ContentType, msg.Body, msg.ReplyToID)
		}
	} else {
		offsetStr := r.URL.Query().Get("offset")
		offset := int64(0)
		if offsetStr != "" {
			if parsedOffset, err := strconv.ParseInt(offsetStr, 10, 64); err == nil {
				offset = parsedOffset
			}
		}
		msgs, err := s.queries.GetConversationMessages(r.Context(), conversationID, limit, offset)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		response = make([]messageResponse, len(msgs))
		for i, msg := range msgs {
			response[i] = s.convertToMessageResponse(msg.ID, msg.ConversationID, msg.Seq, msg.SenderID,
				msg.SenderUsername, msg.SenderProfileImageHash, msg.CreatedAt, msg.EditedAt,
				msg.ContentType, msg.Body, msg.ReplyToID)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) convertToMessageResponse(id, conversationID, seq, senderID int64,
	senderUsername string, senderProfileImageHash *string, createdAt time.Time, editedAt *time.Time,
	contentType, encryptedBody string, replyToID *int64) messageResponse {

	var profileImageURL *string
	if senderProfileImageHash != nil {
		url := fmt.Sprintf("/api/profile/image/%s", *senderProfileImageHash)
		profileImageURL = &url
	}

	var editedAtStr *string
	if editedAt != nil {
		str := editedAt.Format("2006-01-02T15:04:05Z")
		editedAtStr = &str
	}

	decrypted, err := crypto.DecryptMessage(encryptedBody, conversationID)
	var messageBody string
	if err != nil {
		log.Printf("Failed to decrypt message %d in conversation %d: %v", id, conversationID, err)
		messageBody = "[Message could not be decrypted]"
	} else {
		messageBody = decrypted
	}

	return messageResponse{
		ID:                    id,
		ConversationID:        conversationID,
		Seq:                   seq,
		SenderID:              senderID,
		SenderUsername:        senderUsername,
		SenderProfileImageURL: profileImageURL,
		CreatedAt:             createdAt.Format("2006-01-02T15:04:05Z"),
		EditedAt:              editedAtStr,
		ContentType:           contentType,
		Body:                  messageBody,
		ReplyToID:             replyToID,
	}
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Body) == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Message body cannot be empty"})
		return
	}

	conversationID := req.ConversationID

	if conversationID == 0 && req.OtherUserID != nil {
		existingConv, err := s.queries.GetOrCreateDMConversation(r.Context(), userID, *req.OtherUserID)
		if err == nil {
			conversationID = existingConv.ID
		} else {
			tx, err := s.queries.Begin()
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			defer tx.Rollback()

			name := ""
			conv, err := tx.CreateConversation(r.Context(), "dm", &name)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}

			if err := tx.AddConversationParticipant(r.Context(), conv.ID, userID); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}

			if err := tx.AddConversationParticipant(r.Context(), conv.ID, *req.OtherUserID); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}

			if err := tx.Commit(); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}

			conversationID = conv.ID
		}
	}

	if conversationID == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "conversationId or otherUserId required"})
		return
	}

	participants, err := s.queries.GetConversationParticipants(r.Context(), conversationID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	isParticipant := false
	for _, p := range participants {
		if p.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	tx, err := s.queries.Begin()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if err := tx.UpdateConversationSeq(r.Context(), conversationID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	conv, err := tx.GetConversationByID(r.Context(), conversationID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	contentType := "text/markdown"
	settings, err := s.queries.GetUserSettings(r.Context(), userID)
	if err == nil && !settings.MarkdownEnabled {
		contentType = "text/plain"
	}

	encryptedBody, err := crypto.EncryptMessage(req.Body, conversationID)
	if err != nil {
		log.Printf("Error encrypting message: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	message, err := tx.CreateMessage(r.Context(), conversationID, conv.LastMessageSeq, userID, contentType, encryptedBody, req.ReplyToID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	sender, err := s.queries.GetUser(r.Context(), userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var profileImageURL *string
	if sender.ProfileImageHash != nil {
		url := "/api/profile/image/" + *sender.ProfileImageHash
		profileImageURL = &url
	}

	msgResp := messageResponse{
		ID:                    message.ID,
		ConversationID:        message.ConversationID,
		Seq:                   message.Seq,
		SenderID:              sender.ID,
		SenderUsername:        sender.Username,
		SenderProfileImageURL: profileImageURL,
		CreatedAt:             message.CreatedAt.Format("2006-01-02T15:04:05Z"),
		ContentType:           message.ContentType,
		Body:                  req.Body,
		ReplyToID:             req.ReplyToID,
	}

	go s.BroadcastMessageToConversation(conversationID, msgResp, userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msgResp)
}

func (s *Server) handleUpdateReadState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req updateReadStateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	participants, err := s.queries.GetConversationParticipants(r.Context(), req.ConversationID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	isParticipant := false
	for _, p := range participants {
		if p.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	if err := s.queries.UpdateReadState(r.Context(), req.ConversationID, userID, req.LastReadSeq); err != nil {
		log.Printf("Failed to update read state for user %d in conversation %d: %v", userID, req.ConversationID, err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to update read state"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (s *Server) handleSearchUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]userSearchResult{})
		return
	}

	users, err := s.queries.SearchUsers(r.Context(), "%"+query+"%", userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	results := make([]userSearchResult, len(users))
	for i, user := range users {
		var profileImageURL *string
		if user.ProfileImageHash != nil {
			url := fmt.Sprintf("/api/profile/image/%s", *user.ProfileImageHash)
			profileImageURL = &url
		}

		results[i] = userSearchResult{
			ID:              user.ID,
			Username:        user.Username,
			ProfileImageURL: profileImageURL,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (s *Server) handleGetOrCreateDM(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req getOrCreateDMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	if req.OtherUserID == userID {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Cannot create conversation with yourself"})
		return
	}

	otherUser, err := s.queries.GetUser(r.Context(), req.OtherUserID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "User not found"})
		return
	}

	existingConv, err := s.queries.GetOrCreateDMConversation(r.Context(), userID, req.OtherUserID)
	if err == nil {
		participants, err := s.queries.GetConversationParticipants(r.Context(), existingConv.ID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		var otherUserInfo *struct {
			ID              int64   `json:"id"`
			Username        string  `json:"username"`
			ProfileImageURL *string `json:"profileImageUrl"`
		}

		for _, p := range participants {
			if p.ID != userID {
				var profileImageURL *string
				if p.ProfileImageHash != nil {
					url := fmt.Sprintf("/api/profile/image/%s", *p.ProfileImageHash)
					profileImageURL = &url
				}
				otherUserInfo = &struct {
					ID              int64   `json:"id"`
					Username        string  `json:"username"`
					ProfileImageURL *string `json:"profileImageUrl"`
				}{
					ID:              p.ID,
					Username:        p.Username,
					ProfileImageURL: profileImageURL,
				}
				break
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(conversationResponse{
			ID:             existingConv.ID,
			Type:           existingConv.Type,
			Name:           existingConv.Name,
			LastMessageSeq: existingConv.LastMessageSeq,
			UnreadCount:    0,
			OtherUser:      otherUserInfo,
		})
		return
	}

	tx, err := s.queries.Begin()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	name := ""
	conv, err := tx.CreateConversation(r.Context(), "dm", &name)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if err := tx.AddConversationParticipant(r.Context(), conv.ID, userID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if err := tx.AddConversationParticipant(r.Context(), conv.ID, req.OtherUserID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	var profileImageURL *string
	if otherUser.ProfileImageHash != nil {
		url := fmt.Sprintf("/api/profile/image/%s", *otherUser.ProfileImageHash)
		profileImageURL = &url
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conversationResponse{
		ID:             conv.ID,
		Type:           conv.Type,
		Name:           conv.Name,
		LastMessageSeq: conv.LastMessageSeq,
		UnreadCount:    0,
		OtherUser: &struct {
			ID              int64   `json:"id"`
			Username        string  `json:"username"`
			ProfileImageURL *string `json:"profileImageUrl"`
		}{
			ID:              otherUser.ID,
			Username:        otherUser.Username,
			ProfileImageURL: profileImageURL,
		},
	})
}
