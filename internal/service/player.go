package service

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/froemosen/GameJam-2025/internal/metrics"
	"github.com/froemosen/GameJam-2025/internal/utils"
	"github.com/gorilla/websocket"
)

// Thread-safe player structure
type Player struct {
	ID            string             `json:"id"`
	Username      string             `json:"username"`
	SessionID     string             `json:"sessionId"`
	Position      map[string]float64 `json:"position"`
	Rotation      map[string]float64 `json:"rotation"`
	ModelRotation map[string]float64 `json:"modelRotation"`
	Animation     string             `json:"animation"`
	Conn          *websocket.Conn    `json:"-"`
	Disconnected  bool               `json:"-"`
	mu            sync.RWMutex       `json:"-"`
	writeMu       sync.Mutex         `json:"-"` // Protects writes to Conn
}

func NewPlayer(conn *websocket.Conn) *Player {
	playerID := utils.GeneratePlayerID()
	log.Printf("New connection with playerID: %s", playerID)

	return &Player{
		ID:           playerID,
		Position:     map[string]float64{"x": 0, "y": 0, "z": 0},
		Rotation:     map[string]float64{"y": 0},
		Animation:    "idle",
		Disconnected: false,
		Conn:         conn,
	}
}

func (p *Player) WriteMessage(messageType int, data []byte) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if p.Conn == nil || p.Disconnected {
		return fmt.Errorf("cannot write message: connection is closed")
	}

	// Track bytes sent
	metrics.BytesSent.Add(float64(len(data)))

	// Extract message type for metrics
	var msgType string
	var msg map[string]interface{}
	if err := json.Unmarshal(data, &msg); err == nil {
		if t, ok := msg["type"].(string); ok {
			msgType = t
		}
	}
	if msgType == "" {
		msgType = "unknown"
	}

	log.Printf("Sending message to player %s: %s", p.ID, string(data))
	err := p.Conn.WriteMessage(messageType, data)

	if err != nil {
		metrics.MessageSendErrors.WithLabelValues(msgType).Inc()
	} else {
		metrics.MessagesSent.WithLabelValues(msgType).Inc()
	}

	return err
}

func (p *Player) CloseConnection() {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if p.Conn != nil {
		p.Conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Connection was commanded to close"))
		p.Conn.Close()
		p.Conn = nil
	}
}

func (p *Player) IsDisconnected() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.Disconnected
}

func (p *Player) MarkDisconnected() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Disconnected = true
}

func (p *Player) SetUsername(username string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Username = username
	log.Printf("Player %s set username to %s", p.ID, username)
}

func (p *Player) JoinSession(session *GameSession) {
	session.AddPlayer(p)
	p.mu.Lock()
	p.SessionID = session.ID
	p.mu.Unlock()
}

func (p *Player) GetSession() *GameSession {
	p.mu.RLock()
	sessionID := p.SessionID
	p.mu.RUnlock()

	if sessionID != "" {
		if session, exists := State.GetSession(sessionID); exists {
			return session
		}
	}
	return nil
}

func (p *Player) ExportInfo() map[string]interface{} {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return map[string]interface{}{
		"id":            p.ID,
		"username":      p.Username,
		"position":      p.Position,
		"rotation":      p.Rotation,
		"modelRotation": p.ModelRotation,
		"animation":     p.Animation,
	}
}

// a function to set Position, Rotation, ModelRotation, Animation
func (p *Player) UpdateState(position, rotation, modelRotation map[string]float64, animation string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Position = position
	p.Rotation = rotation
	p.ModelRotation = modelRotation
	p.Animation = animation
}
