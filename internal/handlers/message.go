package handlers

import (
	"encoding/json"
	"log"
	"time"

	"github.com/froemosen/GameJam-2025/internal/config"
	"github.com/froemosen/GameJam-2025/internal/metrics"
	"github.com/froemosen/GameJam-2025/internal/service"
	"github.com/gorilla/websocket"
)

const (
	GetSessions   = "listSessions"
	CreateSession = "createSession"
	JoinSession   = "joinSession"
	StartSession  = "startSession"
	UpdatePlayer  = "update"
	PlayerSound   = "sound"
)

// Handle messages from a player
// Connection timeout is managed by WebSocket read deadline + ping/pong:
// - Read deadline is set to ReadTimeout (60s)
// - Client must send a message or pong within that time
// - We send pings every PingRate (30s) to keep connection alive
// - If client doesn't respond, read deadline expires and connection closes
func handlePlayerMessages(player *service.Player) {
	defer HandleDisconnect(player)

	// Start ping ticker
	ticker := time.NewTicker(config.PingRate)
	defer ticker.Stop()

	log.Printf("Started message handler for player %s", player.ID)

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
			log.Printf("Received message from player %s: %s", player.ID, string(messageData))
			messageChan <- messageData
		}
	}()

	for {
		select {
		case messageData := <-messageChan:
			// Reset read deadline on each message
			player.Conn.SetReadDeadline(time.Now().Add(config.ReadTimeout))

			// Track bytes received
			metrics.BytesReceived.Add(float64(len(messageData)))

			var msg service.Message
			if err := json.Unmarshal(messageData, &msg); err != nil {
				log.Printf("Error parsing message from player %s: %v", player.ID, err)
				continue
			}

			// Track message received
			metrics.MessagesReceived.WithLabelValues(msg.Type).Inc()

			// Track processing duration
			start := time.Now()
			handleMessage(player, &msg)
			duration := time.Since(start).Seconds()
			metrics.MessageProcessingDuration.WithLabelValues(msg.Type).Observe(duration)

		case err := <-errorChan:
			// Only log unexpected errors (not normal closes)
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure, websocket.CloseNormalClosure) {
				log.Printf("WebSocket error for player %s: %v", player.ID, err)
			}
			return

		case <-ticker.C:
			// Send ping - use WriteControl with ReadTimeout deadline
			log.Printf("Sending ping to player %s", player.ID)
			err := player.Conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(config.ReadTimeout))
			if err != nil {
				// Only log if it's not a "connection closed" error
				if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					log.Printf("Player %s ping failed: %v", player.ID, err)
				}
				return
			}
		}
	}
}

// Handle different message types
func handleMessage(player *service.Player, msg *service.Message) {
	switch msg.Type {
	case GetSessions:
		handleListSessions(player)
	case CreateSession:
		handleCreateSession(player, msg)
	case JoinSession:
		handleJoinSession(player, msg)
	case StartSession:
		handleStartSession(player, msg)
	case UpdatePlayer:
		handleUpdate(player, msg)
	case PlayerSound:
		handleSound(player, msg)
	}
}
