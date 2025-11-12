package service

import (
	"log"
	"sync"
	"time"

	"github.com/froemosen/GameJam-2025/internal/events"
	"github.com/froemosen/GameJam-2025/internal/utils"
	"github.com/gorilla/websocket"
)

// Thread-safe session structure
type GameSession struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	CreatorID   string             `json:"creatorId"`
	Players     map[string]*Player `json:"-"`
	PlayerCount int                `json:"playerCount"`
	CreatedAt   time.Time          `json:"createdAt"`
	mu          sync.RWMutex       `json:"-"`
}

func NewGameSession(name, creatorID string) *GameSession {
	sessionID := utils.GenerateSessionID()

	return &GameSession{
		ID:          sessionID,
		Name:        name,
		CreatorID:   creatorID,
		Players:     make(map[string]*Player),
		PlayerCount: 0,
		CreatedAt:   time.Now(),
		mu:          sync.RWMutex{},
	}
}

// Add player to session (thread-safe)
func (s *GameSession) AddPlayer(player *Player) {
	// Get existing players in session
	existingPlayers := s.ExportPlayerInfos()

	s.mu.Lock()
	s.Players[player.ID] = player
	s.PlayerCount = len(s.Players)
	s.mu.Unlock()

	// Notify the joining player
	payload := events.FormatJoinSession(s.ID, player.ID, existingPlayers)
	err := player.WriteMessage(websocket.TextMessage, payload)
	if err != nil {
		log.Printf("Error sending session joined message to player %s: %v", player.ID, err)
		return
	}

	// Notify other players
	playerData := player.ExportInfo()
	payload = events.FormatPlayerJoined(playerData)
	s.Broadcast(payload)

	log.Printf("Player %s added to session %s. Session players: %d", player.ID, s.ID, s.PlayerCount)
}

// Remove player from session (thread-safe)
func (s *GameSession) RemovePlayer(playerID string) {
	s.mu.Lock()
	delete(s.Players, playerID)
	s.PlayerCount = len(s.Players)
	s.mu.Unlock()

	// Notify other players
	payload := events.FormatPlayerLeft(playerID)
	s.Broadcast(payload)

	log.Printf("Player %s removed from session %s. Session players: %d", playerID, s.ID, s.PlayerCount)
}

// Get player count (thread-safe)
func (s *GameSession) GetPlayerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.PlayerCount
}

// Check if session is empty (thread-safe)
func (s *GameSession) IsEmpty() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.Players) == 0
}

func (s *GameSession) ExportInfo() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return map[string]interface{}{
		"id":          s.ID,
		"name":        s.Name,
		"creatorId":   s.CreatorID,
		"playerCount": s.PlayerCount,
		"createdAt":   s.CreatedAt,
	}
}

func (s *GameSession) ExportPlayerInfos() []map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	playerInfos := make([]map[string]interface{}, 0, len(s.Players))
	for _, player := range s.Players {
		playerInfos = append(playerInfos, player.ExportInfo())
	}
	return playerInfos
}

func (s *GameSession) Broadcast(message []byte) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if message == nil {
		log.Printf("Broadcast message is nil, skipping broadcast in session %s", s.ID)
		return
	}

	// Send messages in parallel
	var wg sync.WaitGroup
	for _, player := range s.Players {
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
