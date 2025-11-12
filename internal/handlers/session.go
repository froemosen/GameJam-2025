package handlers

import (
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
	session := service.NewGameSession(msg.SessionName, player.ID)

	log.Printf("Creating session %s (%s) by player %s", session.ID, msg.SessionName, player.ID)

	service.State.AddSession(session)

	log.Printf("Session created: %s (%s) by player %s", session.ID, msg.SessionName, player.ID)

	payload := events.FormatCreateSession(session.ID, session.Name)
	err := player.WriteMessage(websocket.TextMessage, payload)
	if err != nil {
		log.Printf("Error sending session created message to player %s: %v", player.ID, err)
	}
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
