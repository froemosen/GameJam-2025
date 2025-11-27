package handlers

import (
	"log"

	"github.com/froemosen/GameJam-2025/internal/events"
	"github.com/froemosen/GameJam-2025/internal/service"
	"github.com/froemosen/GameJam-2025/internal/spatial"
)

// Handle position update
func handleUpdate(player *service.Player, msg *service.Message) {
	player.UpdateState(msg.Position, msg.Rotation, msg.ModelRotation, msg.Animation)
	session := player.GetSession()

	if session != nil {
		// Update player position in spatial grid
		session.Grid.UpdatePlayerPosition(player.ID, spatial.Position{
			X: msg.Position["x"],
			Y: msg.Position["y"],
			Z: msg.Position["z"],
		})

		// OPTIMIZATION: Only broadcast to nearby players (Area of Interest)
		nearbyPlayerIDs := session.Grid.GetNearbyPlayers(player.ID, spatial.Position{
			X: msg.Position["x"],
			Y: msg.Position["y"],
			Z: msg.Position["z"],
		})

		// Only send to nearby players instead of everyone
		payload := events.FormatPlayerUpdated(player.ID, msg.Position, msg.Rotation, msg.ModelRotation, msg.Animation)
		session.BroadcastToPlayers(payload, nearbyPlayerIDs)
	}
}

// Handle sound event
func handleSound(player *service.Player, msg *service.Message) {
	session := player.GetSession()

	if session != nil {
		payload := events.FormatPlaySound(player.ID, msg.SoundType, msg.Position)
		session.Broadcast(payload)
	}
}

// Handle player disconnect
func HandleDisconnect(player *service.Player) {
	// Prevent duplicate disconnect handling
	if player.IsDisconnected() {
		return
	}

	session := player.GetSession()

	log.Printf("Player %s disconnected", player.ID)

	// Close WebSocket connection properly
	player.CloseConnection()

	// Mark player as disconnected
	player.MarkDisconnected()

	if session != nil {
		// Remove from spatial grid
		session.Grid.RemovePlayer(player.ID)

		// RemovePlayer will handle session cleanup if creator leaves idling session
		// or if session becomes empty after removal
		session.RemovePlayer(player.ID)

		// Note: RemovePlayer already calls State.RemoveSession() when appropriate
		// (when creator leaves idling session), so we only clean up empty STARTED sessions here
		if session.IsEmpty() && session.IsStarted() {
			service.State.RemoveSession(session.ID)
		}
	} else {
		service.State.RemoveLobbyPlayer(player.ID)
	}
}
