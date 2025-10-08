// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bloodmagesoftware/teamsync/auth"
	"github.com/gorilla/websocket"
)

type startCallRequest struct {
	ConversationID int64 `json:"conversationId"`
}

type startCallResponse struct {
	CallID    int64 `json:"callId"`
	MessageID int64 `json:"messageId"`
}

type callStatusResponse struct {
	Active bool `json:"active"`
}

type callSignalMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type callConnection struct {
	userID int64
	conn   *websocket.Conn
	send   chan callSignalMessage
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	callConnections = make(map[int64][]*callConnection)
	callMutex       sync.RWMutex
)

func (s *Server) handleStartCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req startCallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	conv, err := s.queries.GetConversationByID(r.Context(), req.ConversationID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if conv.Type != "dm" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Calls are only supported in DMs"})
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

	activeCall, err := s.queries.GetActiveCallByConversation(r.Context(), req.ConversationID)
	if err == nil && activeCall.ID != 0 {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "A call is already active"})
		return
	}

	tx, err := s.queries.Begin()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if err := tx.UpdateConversationSeq(r.Context(), req.ConversationID); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	conv, err = tx.GetConversationByID(r.Context(), req.ConversationID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	message, err := tx.CreateMessage(r.Context(), req.ConversationID, conv.LastMessageSeq, userID, "application/call", "", nil, false, nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	call, err := tx.CreateCall(r.Context(), req.ConversationID, message.ID)
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
		Body:                  message.Body,
	}

	go s.BroadcastMessageToConversation(req.ConversationID, msgResp, userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(startCallResponse{
		CallID:    call.ID,
		MessageID: message.ID,
	})
}

func (s *Server) handleCallSignaling(w http.ResponseWriter, r *http.Request) {
	var accessToken string

	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			accessToken = parts[1]
		}
	}

	if accessToken == "" {
		accessToken = r.URL.Query().Get("token")
	}

	if accessToken == "" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	token, err := s.queries.GetTokenByAccessToken(r.Context(), accessToken)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	if time.Now().After(token.AccessTokenExpiresAt) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	userID := token.UserID

	messageIDStr := r.URL.Query().Get("messageId")
	if messageIDStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	messageID, err := strconv.ParseInt(messageIDStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	call, err := s.queries.GetCallByMessageID(r.Context(), messageID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	participants, err := s.queries.GetConversationParticipants(r.Context(), call.ConversationID)
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

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	callConn := &callConnection{
		userID: userID,
		conn:   conn,
		send:   make(chan callSignalMessage, 256),
	}

	callMutex.Lock()
	callConnections[call.ID] = append(callConnections[call.ID], callConn)
	connections := callConnections[call.ID]
	log.Printf("User %d connected to call %d. Total connections: %d", userID, call.ID, len(connections))

	if len(connections) == 2 {
		for _, conn := range connections {
			select {
			case conn.send <- callSignalMessage{Type: "peer-joined"}:
				log.Printf("Sent peer-joined to user %d", conn.userID)
			default:
				log.Printf("Failed to send peer-joined to user %d", conn.userID)
			}
		}
	}
	callMutex.Unlock()

	go s.writePump(callConn)

	s.readPump(call.ID, callConn)
}

func (s *Server) readPump(callID int64, c *callConnection) {
	defer func() {
		c.conn.Close()

		callMutex.Lock()
		connections := callConnections[callID]
		var otherConnections []*callConnection
		for _, conn := range connections {
			if conn != c {
				otherConnections = append(otherConnections, conn)
			}
		}
		delete(callConnections, callID)
		callMutex.Unlock()

		log.Printf("User %d disconnected from call %d. Closing %d other connection(s)", c.userID, callID, len(otherConnections))

		for _, conn := range otherConnections {
			close(conn.send)
			conn.conn.Close()
			log.Printf("Closed connection for user %d", conn.userID)
		}

		ctx := context.Background()
		if err := s.queries.EndCall(ctx, callID); err != nil {
			log.Printf("error ending call: %v", err)
		}
	}()

	for {
		var msg callSignalMessage
		if err := c.conn.ReadJSON(&msg); err != nil {
			log.Printf("Read error from user %d: %v", c.userID, err)
			break
		}

		log.Printf("Received %s from user %d in call %d", msg.Type, c.userID, callID)

		callMutex.RLock()
		for _, conn := range callConnections[callID] {
			if conn.userID != c.userID {
				log.Printf("Forwarding %s to user %d", msg.Type, conn.userID)
				select {
				case conn.send <- msg:
				default:
					log.Printf("Send channel full for user %d, dropping message", conn.userID)
				}
			}
		}
		callMutex.RUnlock()
	}
}

func (s *Server) writePump(c *callConnection) {
	for msg := range c.send {
		if err := c.conn.WriteJSON(msg); err != nil {
			log.Printf("Write error to user %d: %v", c.userID, err)
			return
		}
	}
}

func (s *Server) handleCallStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	messageIDStr := r.URL.Query().Get("messageId")
	if messageIDStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	messageID, err := strconv.ParseInt(messageIDStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	call, err := s.queries.GetCallByMessageID(r.Context(), messageID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(callStatusResponse{Active: false})
		return
	}

	msg, err := s.queries.GetMessageByID(r.Context(), messageID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	participants, err := s.queries.GetConversationParticipants(r.Context(), msg.ConversationID)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(callStatusResponse{Active: call.DeletedAt == nil})
}
