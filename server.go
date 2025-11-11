package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	PlayerTimeout   = 30 * time.Second
	SessionTimeout  = 1 * time.Hour
	CleanupInterval = 10 * time.Second
	UpdateRate      = 50 * time.Millisecond // 20 updates per second
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// Thread-safe player structure
type Player struct {
	ID            string             `json:"id"`
	Username      string             `json:"username"`
	SessionID     string             `json:"sessionId"`
	Position      map[string]float64 `json:"position"`
	Rotation      map[string]float64 `json:"rotation"`
	ModelRotation map[string]float64 `json:"modelRotation"`
	Animation     string             `json:"animation"`
	LastUpdate    time.Time          `json:"-"`
	Conn          *websocket.Conn    `json:"-"`
	mu            sync.RWMutex       `json:"-"`
}

// Thread-safe session structure
type GameSession struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	CreatorID    string          `json:"creatorId"`
	Players      map[string]bool `json:"-"`
	PlayerCount  int             `json:"playerCount"`
	CreatedAt    time.Time       `json:"createdAt"`
	LastActivity time.Time       `json:"lastActivity"`
	mu           sync.RWMutex    `json:"-"`
}

// Global state with thread-safe access
type GameState struct {
	players  map[string]*Player
	sessions map[string]*GameSession
	mu       sync.RWMutex
}

var state = &GameState{
	players:  make(map[string]*Player),
	sessions: make(map[string]*GameSession),
}

// Message types
type Message struct {
	Type          string                   `json:"type"`
	SessionID     string                   `json:"sessionId,omitempty"`
	SessionName   string                   `json:"sessionName,omitempty"`
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

// Generate random session ID (6 characters, no confusing chars)
func generateSessionID() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No 0, O, I, 1
	rand.Seed(time.Now().UnixNano())
	b := make([]byte, 6)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

// Generate random player ID
func generatePlayerID() string {
	rand.Seed(time.Now().UnixNano())
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 9)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

// Add player to session (thread-safe)
func (s *GameSession) AddPlayer(playerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Players[playerID] = true
	s.PlayerCount = len(s.Players)
	s.LastActivity = time.Now()
}

// Remove player from session (thread-safe)
func (s *GameSession) RemovePlayer(playerID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Players, playerID)
	s.PlayerCount = len(s.Players)
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

// Broadcast to session (thread-safe)
func broadcastToSession(sessionID string, message []byte, excludePlayerID string) {
	state.mu.RLock()
	defer state.mu.RUnlock()

	session, exists := state.sessions[sessionID]
	if !exists {
		return
	}

	session.mu.RLock()
	playerIDs := make([]string, 0, len(session.Players))
	for pid := range session.Players {
		if pid != excludePlayerID {
			playerIDs = append(playerIDs, pid)
		}
	}
	session.mu.RUnlock()

	// Send messages in parallel
	var wg sync.WaitGroup
	for _, pid := range playerIDs {
		if player, ok := state.players[pid]; ok {
			wg.Add(1)
			go func(p *Player) {
				defer wg.Done()
				p.mu.RLock()
				conn := p.Conn
				p.mu.RUnlock()

				if conn != nil {
					err := conn.WriteMessage(websocket.TextMessage, message)
					if err != nil {
						log.Printf("Error broadcasting to player %s: %v", p.ID, err)
					}
				}
			}(player)
		}
	}
	wg.Wait()
}

// Broadcast to all clients (for menu updates)
func broadcastToAll(message []byte) {
	state.mu.RLock()
	players := make([]*Player, 0, len(state.players))
	for _, p := range state.players {
		players = append(players, p)
	}
	state.mu.RUnlock()

	var wg sync.WaitGroup
	for _, player := range players {
		wg.Add(1)
		go func(p *Player) {
			defer wg.Done()
			p.mu.RLock()
			conn := p.Conn
			p.mu.RUnlock()

			if conn != nil {
				err := conn.WriteMessage(websocket.TextMessage, message)
				if err != nil {
					log.Printf("Error broadcasting to player %s: %v", p.ID, err)
				}
			}
		}(player)
	}
	wg.Wait()
}

// Handle WebSocket connection
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	playerID := generatePlayerID()
	log.Printf("New connection: %s", playerID)

	player := &Player{
		ID:            playerID,
		Position:      map[string]float64{"x": 0, "y": 0, "z": 0},
		Rotation:      map[string]float64{"y": 0},
		ModelRotation: map[string]float64{"y": 0},
		Animation:     "idle",
		LastUpdate:    time.Now(),
		Conn:          conn,
	}

	state.mu.Lock()
	state.players[playerID] = player
	state.mu.Unlock()

	// Set up pong handler to update last activity
	conn.SetPongHandler(func(string) error {
		player.mu.Lock()
		player.LastUpdate = time.Now()
		player.mu.Unlock()
		return nil
	})

	// Set read deadline
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	// Handle messages from this client (blocking call)
	handlePlayerMessages(player)
}

// Handle messages from a player
func handlePlayerMessages(player *Player) {
	defer handleDisconnect(player)

	// Start ping ticker
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Channel to signal message read
	messageChan := make(chan []byte, 10)
	errorChan := make(chan error, 1)

	// Read messages in a goroutine
	go func() {
		for {
			_, messageData, err := player.Conn.ReadMessage()
			if err != nil {
				errorChan <- err
				return
			}
			messageChan <- messageData
		}
	}()

	for {
		select {
		case messageData := <-messageChan:
			// Reset read deadline on each message
			player.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))

			// Update last activity
			player.mu.Lock()
			player.LastUpdate = time.Now()
			player.mu.Unlock()

			var msg Message
			if err := json.Unmarshal(messageData, &msg); err != nil {
				log.Printf("Error parsing message from player %s: %v", player.ID, err)
				continue
			}

			handleMessage(player, &msg)

		case err := <-errorChan:
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error for player %s: %v", player.ID, err)
			}
			return

		case <-ticker.C:
			// Send ping
			player.mu.Lock()
			conn := player.Conn
			player.mu.Unlock()

			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Player %s ping failed: %v", player.ID, err)
				return
			}
		}
	}
}

// Handle different message types
func handleMessage(player *Player, msg *Message) {
	switch msg.Type {
	case "listSessions":
		handleListSessions(player)
	case "createSession":
		handleCreateSession(player, msg)
	case "joinSession":
		handleJoinSession(player, msg)
	case "setUsername":
		handleSetUsername(player, msg)
	case "update":
		handleUpdate(player, msg)
	case "sound":
		handleSound(player, msg)
	}
}

// Handle list sessions request
func handleListSessions(player *Player) {
	state.mu.RLock()
	sessions := make([]map[string]interface{}, 0, len(state.sessions))
	for _, session := range state.sessions {
		session.mu.RLock()
		sessions = append(sessions, map[string]interface{}{
			"id":          session.ID,
			"name":        session.Name,
			"playerCount": session.PlayerCount,
			"createdAt":   session.CreatedAt.Format(time.RFC3339),
		})
		session.mu.RUnlock()
	}
	state.mu.RUnlock()

	response, _ := json.Marshal(Message{
		Type:    "sessionList",
		Players: sessions,
	})

	player.mu.RLock()
	conn := player.Conn
	player.mu.RUnlock()

	conn.WriteMessage(websocket.TextMessage, response)
}

// Handle create session request
func handleCreateSession(player *Player, msg *Message) {
	sessionID := generateSessionID()

	session := &GameSession{
		ID:           sessionID,
		Name:         msg.SessionName,
		CreatorID:    player.ID,
		Players:      make(map[string]bool),
		CreatedAt:    time.Now(),
		LastActivity: time.Now(),
	}

	state.mu.Lock()
	state.sessions[sessionID] = session
	state.mu.Unlock()

	log.Printf("Session created: %s (%s) by player %s", sessionID, msg.SessionName, player.ID)

	response, _ := json.Marshal(Message{
		Type:        "sessionCreated",
		SessionID:   sessionID,
		SessionName: msg.SessionName,
	})

	player.mu.RLock()
	conn := player.Conn
	player.mu.RUnlock()

	conn.WriteMessage(websocket.TextMessage, response)
}

// Handle join session request
func handleJoinSession(player *Player, msg *Message) {
	state.mu.RLock()
	session, exists := state.sessions[msg.SessionID]
	state.mu.RUnlock()

	if !exists {
		response, _ := json.Marshal(Message{
			Type:    "error",
			Message: "Session not found. Please check the ID and try again.",
		})
		player.mu.RLock()
		conn := player.Conn
		player.mu.RUnlock()
		conn.WriteMessage(websocket.TextMessage, response)
		return
	}

	player.mu.Lock()
	player.SessionID = msg.SessionID
	player.mu.Unlock()

	session.AddPlayer(player.ID)

	log.Printf("Player %s joined session %s", player.ID, msg.SessionID)

	// Get existing players in session
	state.mu.RLock()
	existingPlayers := make([]map[string]interface{}, 0)
	session.mu.RLock()
	for pid := range session.Players {
		if pid != player.ID {
			if p, ok := state.players[pid]; ok {
				p.mu.RLock()
				existingPlayers = append(existingPlayers, map[string]interface{}{
					"id":            p.ID,
					"username":      p.Username,
					"position":      p.Position,
					"rotation":      p.Rotation,
					"modelRotation": p.ModelRotation,
					"animation":     p.Animation,
				})
				p.mu.RUnlock()
			}
		}
	}
	session.mu.RUnlock()
	state.mu.RUnlock()

	response, _ := json.Marshal(Message{
		Type:      "sessionJoined",
		SessionID: msg.SessionID,
		PlayerID:  player.ID,
		Players:   existingPlayers,
	})

	player.mu.RLock()
	conn := player.Conn
	player.mu.RUnlock()

	conn.WriteMessage(websocket.TextMessage, response)
}

// Handle set username
func handleSetUsername(player *Player, msg *Message) {
	player.mu.Lock()
	player.Username = msg.Username
	sessionID := player.SessionID
	player.mu.Unlock()

	log.Printf("Player %s set username to: %s", player.ID, msg.Username)

	if sessionID != "" {
		player.mu.RLock()
		playerData := map[string]interface{}{
			"id":            player.ID,
			"username":      player.Username,
			"position":      player.Position,
			"rotation":      player.Rotation,
			"modelRotation": player.ModelRotation,
			"animation":     player.Animation,
		}
		player.mu.RUnlock()

		response, _ := json.Marshal(Message{
			Type:   "playerJoined",
			Player: playerData,
		})

		broadcastToSession(sessionID, response, player.ID)
	}
}

// Handle position update
func handleUpdate(player *Player, msg *Message) {
	player.mu.Lock()
	player.Position = msg.Position
	player.Rotation = msg.Rotation
	player.ModelRotation = msg.ModelRotation
	player.Animation = msg.Animation
	player.LastUpdate = time.Now()
	sessionID := player.SessionID
	player.mu.Unlock()

	if sessionID != "" {
		response, _ := json.Marshal(Message{
			Type:          "playerUpdate",
			ID:            player.ID,
			Position:      msg.Position,
			Rotation:      msg.Rotation,
			ModelRotation: msg.ModelRotation,
			Animation:     msg.Animation,
		})

		broadcastToSession(sessionID, response, player.ID)
	}
}

// Handle sound event
func handleSound(player *Player, msg *Message) {
	player.mu.RLock()
	sessionID := player.SessionID
	player.mu.RUnlock()

	if sessionID != "" {
		response, _ := json.Marshal(Message{
			Type:      "sound",
			ID:        player.ID,
			SoundType: msg.SoundType,
			Position:  msg.Position,
		})

		broadcastToSession(sessionID, response, player.ID)
	}
}

// Handle player disconnect
func handleDisconnect(player *Player) {
	log.Printf("Player %s disconnected", player.ID)

	player.mu.RLock()
	sessionID := player.SessionID
	player.mu.RUnlock()

	state.mu.Lock()
	delete(state.players, player.ID)
	state.mu.Unlock()

	if sessionID != "" {
		state.mu.RLock()
		session, exists := state.sessions[sessionID]
		state.mu.RUnlock()

		if exists {
			session.RemovePlayer(player.ID)
			log.Printf("Player %s removed from session %s. Session players: %d",
				player.ID, sessionID, session.GetPlayerCount())

			// Notify other players
			response, _ := json.Marshal(Message{
				Type: "playerLeft",
				ID:   player.ID,
			})
			broadcastToSession(sessionID, response, player.ID)

			// Clean up empty sessions
			if session.IsEmpty() {
				state.mu.Lock()
				delete(state.sessions, sessionID)
				state.mu.Unlock()
				log.Printf("Session %s deleted (empty)", sessionID)
			}
		}
	}
}

// Cleanup inactive players and sessions
func cleanupLoop() {
	ticker := time.NewTicker(CleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()

		// Cleanup inactive players
		state.mu.RLock()
		playersToRemove := make([]*Player, 0)
		for _, player := range state.players {
			player.mu.RLock()
			if now.Sub(player.LastUpdate) > PlayerTimeout {
				playersToRemove = append(playersToRemove, player)
			}
			player.mu.RUnlock()
		}
		state.mu.RUnlock()

		for _, player := range playersToRemove {
			log.Printf("Player %s timed out", player.ID)
			handleDisconnect(player)
		}

		// Cleanup inactive sessions
		state.mu.RLock()
		sessionsToRemove := make([]string, 0)
		for sessionID, session := range state.sessions {
			session.mu.RLock()
			if len(session.Players) == 0 && now.Sub(session.LastActivity) > SessionTimeout {
				sessionsToRemove = append(sessionsToRemove, sessionID)
			}
			session.mu.RUnlock()
		}
		state.mu.RUnlock()

		if len(sessionsToRemove) > 0 {
			state.mu.Lock()
			for _, sessionID := range sessionsToRemove {
				delete(state.sessions, sessionID)
				log.Printf("Session %s deleted (inactive for 1 hour)", sessionID)
			}
			state.mu.Unlock()
		}
	}
}

// Health check endpoint
func healthHandler(w http.ResponseWriter, r *http.Request) {
	state.mu.RLock()
	playerCount := len(state.players)
	sessionCount := len(state.sessions)
	state.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "healthy",
		"players":  playerCount,
		"sessions": sessionCount,
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "5500"
	}

	// Start cleanup goroutine
	go cleanupLoop()

	// Setup routes
	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/health", healthHandler)

	// Serve static files
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)

	log.Printf("Go MMO Server running on port %s", port)
	log.Printf("WebSocket endpoint: ws://localhost:%s/ws", port)

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal("Server error:", err)
	}
}
