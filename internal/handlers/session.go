package handlers

import (
	"encoding/json"
	"log"

	"github.com/froemosen/GameJam-2025/internal/events"
	"github.com/froemosen/GameJam-2025/internal/service"
	"github.com/gorilla/websocket"
)

// Handle list sessions request
func handleListSessions(player *service.Player) {
	sessions := service.State.ListSessions()

	payload := events.FormatUpdateSessionList(sessions)

	err := player.WriteMessage(websocket.TextMessage, payload)
	if err != nil {
		log.Printf("Error sending session list to player %s: %v", player.ID, err)
	}
}

// Handle create session request
func handleCreateSession(player *service.Player, msg *service.Message) {
	// Set player username from the message
	if msg.Username != "" {
		player.SetUsername(msg.Username)
	}

	session := service.NewGameSession(msg.SessionName, player.ID)

	log.Printf("Creating session %s (%s) by player %s", session.ID, msg.SessionName, player.ID)

	// Creator immediately joins the session (idling state)
	player.JoinSession(session)

	service.State.AddSession(session)

	log.Printf("Session created and creator joined: %s (%s) by player %s (%s)", session.ID, msg.SessionName, player.ID, player.Username)
}

// Handle join session request
func handleJoinSession(player *service.Player, msg *service.Message) {
	session, exists := service.State.GetSession(msg.SessionID)
	if !exists {
		payload := events.FormatSessionNotFound()
		err := player.WriteMessage(websocket.TextMessage, payload)
		if err != nil {
			log.Printf("Error sending session not found message to player %s: %v", player.ID, err)
		}
		return
	}

	// Set player username
	player.SetUsername(msg.Username)

	// Add player to session
	player.JoinSession(session)
	log.Printf("Player %s (%s) joined session %s", player.ID, msg.Username, msg.SessionID)
}

// Handle start session request
func handleStartSession(player *service.Player, msg *service.Message) {
	session, exists := service.State.GetSession(msg.SessionID)
	if !exists {
		payload := events.FormatSessionNotFound()
		err := player.WriteMessage(websocket.TextMessage, payload)
		if err != nil {
			log.Printf("Error sending session not found message to player %s: %v", player.ID, err)
		}
		return
	}

	// Check if player is the creator
	if !session.IsCreator(player.ID) {
		payload, _ := json.Marshal(map[string]interface{}{
			"type":    events.ErrorMessage,
			"message": "Only the session creator can start the game",
		})
		err := player.WriteMessage(websocket.TextMessage, payload)
		if err != nil {
			log.Printf("Error sending not creator message to player %s: %v", player.ID, err)
		}
		return
	}

	// Start the session
	session.Start()

	// Notify all players in the session that game has started
	payload := events.FormatSessionStarted(session.ID)
	session.Broadcast(payload)

	log.Printf("Session %s started by creator %s", session.ID, player.ID)
}
