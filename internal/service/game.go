package service

import (
	"log"
	"sync"
	"time"

	"github.com/froemosen/GameJam-2025/internal/config"
	"github.com/froemosen/GameJam-2025/internal/events"
	"github.com/gorilla/websocket"
)

// Message types
type Message struct {
	Type          string                   `json:"type"`
	SessionID     string                   `json:"sessionId,omitempty"`
	SessionName   string                   `json:"sessionName,omitempty"`
	Sessions      []map[string]interface{} `json:"sessions,omitempty"`
	Username      string                   `json:"username,omitempty"`
	Position      map[string]float64       `json:"position,omitempty"`
	Rotation      map[string]float64       `json:"rotation,omitempty"`
	ModelRotation map[string]float64       `json:"modelRotation,omitempty"`
	Animation     string                   `json:"animation,omitempty"`
	SoundType     string                   `json:"soundType,omitempty"`
	ID            string                   `json:"id,omitempty"`
	Player        map[string]interface{}   `json:"player,omitempty"`
	Players       []map[string]interface{} `json:"players,omitempty"`
	PlayerID      string                   `json:"playerId,omitempty"`
	Message       string                   `json:"message,omitempty"`
}

// Global state with thread-safe access
type GameState struct {
	LobbyPlayers map[string]*Player
	Sessions     map[string]*GameSession
	mu           sync.RWMutex
}

var State = &GameState{
	LobbyPlayers: make(map[string]*Player),
	Sessions:     make(map[string]*GameSession),
	mu:           sync.RWMutex{},
}

func (s *GameState) AddLobbyPlayer(player *Player) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LobbyPlayers[player.ID] = player
	log.Printf("Player %s added to lobby", player.ID)
}

func (s *GameState) RemoveLobbyPlayer(playerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.LobbyPlayers, playerID)
	log.Printf("Player %s removed from lobby", playerID)
}

func (s *GameState) GetCounts() (players int, sessions int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.LobbyPlayers), len(s.Sessions)
}

func (s *GameState) ListSessions() []map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sessions := make([]map[string]interface{}, 0, len(s.Sessions))
	for _, session := range s.Sessions {
		sessionInfo := session.ExportInfo()
		sessions = append(sessions, sessionInfo)
	}
	return sessions
}

func (s *GameState) GetSession(sessionID string) (*GameSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, exists := s.Sessions[sessionID]
	return session, exists
}

func (s *GameState) AddSession(session *GameSession) {
	s.mu.Lock()
	s.Sessions[session.ID] = session
	s.mu.Unlock()

	payload := events.FormatUpdateSessionList(s.ListSessions())
	s.Broadcast(payload)

	log.Printf("Session %s added to state", session.ID)
}

func (s *GameState) RemoveSession(sessionID string) {
	s.mu.Lock()
	delete(s.Sessions, sessionID)
	s.mu.Unlock()

	payload := events.FormatUpdateSessionList(s.ListSessions())
	s.Broadcast(payload)

	log.Printf("Session %s removed from state", sessionID)
}

// Broadcast to all lobby clients
func (s *GameState) Broadcast(message []byte) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if message == nil {
		log.Printf("Broadcast message is nil, skipping broadcast")
		return
	}

	var wg sync.WaitGroup
	for _, player := range s.LobbyPlayers {
		wg.Add(1)
		go func(p *Player) {
			defer wg.Done()

			err := p.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Printf("Error broadcasting to player %s: %v", p.ID, err)
			}
		}(player)
	}
	wg.Wait()
}

// Cleanup inactive sessions (players are cleaned up on disconnect via HandleDisconnect)
func CleanupLoop() {
	ticker := time.NewTicker(config.CleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		// Only cleanup inactive sessions - players are removed immediately on disconnect
		State.mu.RLock()
		sessionsToRemove := make([]string, 0)
		for sessionID, session := range State.Sessions {
			if session.IsEmpty() {
				sessionsToRemove = append(sessionsToRemove, sessionID)
			}
		}
		State.mu.RUnlock()

		if len(sessionsToRemove) > 0 {
			for _, sessionID := range sessionsToRemove {
				State.RemoveSession(sessionID)
				log.Printf("Session %s deleted (no players)", sessionID)
			}
		}
	}
}
