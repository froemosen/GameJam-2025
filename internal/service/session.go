package service

import (
	"log"
	"sync"
	"time"

	"github.com/froemosen/GameJam-2025/internal/events"
	"github.com/froemosen/GameJam-2025/internal/metrics"
	"github.com/froemosen/GameJam-2025/internal/spatial"
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
	Started     bool               `json:"started"`
	Grid        *spatial.Grid      `json:"-"` // Spatial partitioning for Area of Interest
	mu          sync.RWMutex       `json:"-"`
}

func NewGameSession(name, creatorID string) *GameSession {
	sessionID := utils.GenerateSessionID()

	// Track session creation
	metrics.TotalSessions.Inc()
	metrics.ActiveSessions.Inc()

	return &GameSession{
		ID:          sessionID,
		Name:        name,
		CreatorID:   creatorID,
		Players:     make(map[string]*Player),
		PlayerCount: 0,
		CreatedAt:   time.Now(),
		Started:     false,
		Grid:        spatial.NewGrid(50.0, 100.0), // 50 unit cells, 100 unit view distance
		mu:          sync.RWMutex{},
	}
}

// Start the game session
func (s *GameSession) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Started = true
	log.Printf("Session %s started by creator %s", s.ID, s.CreatorID)
}

// Check if session is started
func (s *GameSession) IsStarted() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Started
}

// Check if player is the creator
func (s *GameSession) IsCreator(playerID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.CreatorID == playerID
}

// Add player to session (thread-safe)
func (s *GameSession) AddPlayer(player *Player) {
	// Get existing players in session
	existingPlayers := s.ExportPlayerInfos()

	s.mu.Lock()
	s.Players[player.ID] = player
	s.PlayerCount = len(s.Players)
	s.mu.Unlock()

	State.RemoveLobbyPlayer(player.ID)

	// Notify the joining player (include session started status)
	payload := events.FormatJoinSession(s.ID, player.ID, existingPlayers, s.Started)
	err := player.WriteMessage(websocket.TextMessage, payload)
	if err != nil {
		log.Printf("Error sending session joined message to player %s: %v", player.ID, err)
		return
	}

	// Notify other players in the session
	playerData := player.ExportInfo()
	payload = events.FormatPlayerJoined(playerData)
	s.Broadcast(payload)

	// Also notify lobby players (especially the session creator waiting in the main menu)
	// This allows the main menu to show live player counts and names
	State.Broadcast(payload)

	log.Printf("Player %s added to session %s. Session players: %d", player.ID, s.ID, s.PlayerCount)
}

// Remove player from session (thread-safe)
func (s *GameSession) RemovePlayer(playerID string) {
	// Check if this is the creator leaving an idling session
	isCreator := s.IsCreator(playerID)
	isStarted := s.IsStarted()

	s.mu.Lock()
	delete(s.Players, playerID)
	s.PlayerCount = len(s.Players)
	s.mu.Unlock()

	// If creator leaves an idling session, delete the entire session
	if isCreator && !isStarted {
		log.Printf("Creator %s left idling session %s - deleting session", playerID, s.ID)
		State.RemoveSession(s.ID)
		return
	}

	// Notify other players in the session
	payload := events.FormatPlayerLeft(playerID)
	s.Broadcast(payload)

	// Also notify lobby players so they see the updated player count
	State.Broadcast(payload)

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
		"started":     s.Started,
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
	recipientCount := len(s.Players)
	s.mu.RUnlock()

	if message == nil {
		log.Printf("Broadcast message is nil, skipping broadcast in session %s", s.ID)
		return
	}

	// Track broadcast metrics
	metrics.BroadcastRecipients.Observe(float64(recipientCount))

	s.mu.RLock()
	defer s.mu.RUnlock()

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

// BroadcastToPlayers sends a message only to specific players (for Area of Interest)
func (s *GameSession) BroadcastToPlayers(message []byte, playerIDs []string) {
	if message == nil {
		log.Printf("Broadcast message is nil, skipping targeted broadcast in session %s", s.ID)
		return
	}

	// Track broadcast metrics
	metrics.BroadcastRecipients.Observe(float64(len(playerIDs)))

	s.mu.RLock()
	defer s.mu.RUnlock()

	// Send messages in parallel only to specified players
	var wg sync.WaitGroup
	for _, playerID := range playerIDs {
		if player, exists := s.Players[playerID]; exists {
			wg.Add(1)
			go func(p *Player) {
				defer wg.Done()

				err := p.WriteMessage(websocket.TextMessage, message)
				if err != nil {
					log.Printf("Error broadcasting to player %s: %v", p.ID, err)
				}
			}(player)
		}
	}
	wg.Wait()
}
