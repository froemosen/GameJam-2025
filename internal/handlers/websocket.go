package handlers

import (
	"log"
	"net/http"
	"time"

	"github.com/froemosen/GameJam-2025/internal/config"
	"github.com/froemosen/GameJam-2025/internal/metrics"
	"github.com/froemosen/GameJam-2025/internal/service"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// Handle WebSocket connection
func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		metrics.ConnectionErrors.Inc()
		return
	}
	defer conn.Close()

	// Track connection metrics
	metrics.TotalConnections.Inc()
	metrics.ActiveConnections.Inc()
	defer metrics.ActiveConnections.Dec()

	player := service.NewPlayer(conn)

	service.State.AddLobbyPlayer(player)

	// Set up pong handler (resets read deadline automatically)
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(config.ReadTimeout))
		return nil
	})

	// Set initial read deadline
	conn.SetReadDeadline(time.Now().Add(config.ReadTimeout))

	// Handle messages from this client (blocking call)
	handlePlayerMessages(player)
}
