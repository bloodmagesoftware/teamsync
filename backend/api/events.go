// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/bloodmagesoftware/teamsync/auth"
)

type EventType string

const (
	EventTypeMessageNew         EventType = "message.new"
	EventTypeConversationUpdate EventType = "conversation.updated"
	EventTypeKeepAlive          EventType = "keepalive"
)

type Event struct {
	Type EventType   `json:"type"`
	Data interface{} `json:"data"`
}

type eventManager struct {
	mu       sync.RWMutex
	clients  map[int64]map[chan Event]bool
	shutdown chan struct{}
}

var evtMgr = &eventManager{
	clients:  make(map[int64]map[chan Event]bool),
	shutdown: make(chan struct{}),
}

func (em *eventManager) addClient(userID int64, ch chan Event) {
	em.mu.Lock()
	defer em.mu.Unlock()

	if em.clients[userID] == nil {
		em.clients[userID] = make(map[chan Event]bool)
	}
	em.clients[userID][ch] = true
}

func (em *eventManager) removeClient(userID int64, ch chan Event) {
	em.mu.Lock()
	defer em.mu.Unlock()

	if clients, ok := em.clients[userID]; ok {
		if _, exists := clients[ch]; exists {
			delete(clients, ch)
			close(ch)
			if len(clients) == 0 {
				delete(em.clients, userID)
			}
		}
	}
}

func (em *eventManager) shutdownAll() {
	close(em.shutdown)

	em.mu.Lock()
	defer em.mu.Unlock()

	for userID, clients := range em.clients {
		for ch := range clients {
			close(ch)
			delete(clients, ch)
		}
		delete(em.clients, userID)
	}
}

func (em *eventManager) broadcast(userID int64, event Event) {
	em.mu.RLock()
	defer em.mu.RUnlock()

	if clients, ok := em.clients[userID]; ok {
		for ch := range clients {
			select {
			case ch <- event:
			case <-time.After(time.Second):
			}
		}
	}
}

func (em *eventManager) broadcastToConversation(s *Server, conversationID int64, event Event, excludeUserID int64) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	participants, err := s.queries.GetConversationParticipants(ctx, conversationID)
	if err != nil {
		return
	}

	em.mu.RLock()
	defer em.mu.RUnlock()

	for _, p := range participants {
		if p.ID == excludeUserID {
			continue
		}
		if clients, ok := em.clients[p.ID]; ok {
			for ch := range clients {
				select {
				case ch <- event:
				case <-time.After(time.Second):
				}
			}
		}
	}
}

func (s *Server) handleEventStream(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	eventChan := make(chan Event, 10)
	evtMgr.addClient(userID, eventChan)
	defer evtMgr.removeClient(userID, eventChan)

	keepAliveTicker := time.NewTicker(30 * time.Second)
	defer keepAliveTicker.Stop()

	ctx := r.Context()

	for {
		select {
		case <-ctx.Done():
			return
		case <-evtMgr.shutdown:
			return
		case event, ok := <-eventChan:
			if !ok {
				return
			}
			data, err := json.Marshal(event)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-keepAliveTicker.C:
			keepAliveEvent := Event{
				Type: EventTypeKeepAlive,
				Data: map[string]int64{"timestamp": time.Now().Unix()},
			}
			data, err := json.Marshal(keepAliveEvent)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}

func (s *Server) BroadcastMessage(userID int64, message messageResponse) {
	evtMgr.broadcast(userID, Event{
		Type: EventTypeMessageNew,
		Data: message,
	})
}

func (s *Server) BroadcastMessageToConversation(conversationID int64, message messageResponse, excludeUserID int64) {
	evtMgr.broadcastToConversation(s, conversationID, Event{
		Type: EventTypeMessageNew,
		Data: message,
	}, excludeUserID)
}

func (s *Server) BroadcastConversationUpdate(userID int64, conversation conversationResponse) {
	evtMgr.broadcast(userID, Event{
		Type: EventTypeConversationUpdate,
		Data: conversation,
	})
}
