package events

import (
	"encoding/json"
	"log"
)

const (
	UpdateSessionList = "updateSessionList"
	SessionCreated    = "sessionCreated"
	SessionJoined     = "sessionJoined"
	PlayerJoined      = "playerJoined"
	PlayerUpdated     = "playerUpdate"
	PlayerLeft        = "playerLeft"
	PlayerSound       = "playSound"
	ErrorMessage      = "error"
)

func FormatPlayerLeft(playerID string) []byte {
	response, err := json.Marshal(map[string]interface{}{
		"type": PlayerLeft,
		"id":   playerID,
	})
	if err != nil {
		log.Printf("Error marshaling player left message: %v", err)
		return nil
	}
	return response
}

func FormatUpdateSessionList(sessions []map[string]interface{}) []byte {
	response, err := json.Marshal(map[string]interface{}{
		"type":     UpdateSessionList,
		"sessions": sessions,
	})
	if err != nil {
		log.Printf("Error marshaling session list: %v", err)
		return nil
	}
	return response
}

func FormatSessionNotFound() []byte {
	response, err := json.Marshal(map[string]interface{}{
		"type":    ErrorMessage,
		"message": "Session not found. Please check the ID and try again.",
	})
	if err != nil {
		log.Printf("Error marshaling session not found message: %v", err)
		return nil
	}
	return response
}

func FormatCreateSession(sessionID, sessionName string) []byte {
	payload, err := json.Marshal(map[string]interface{}{
		"type":        SessionCreated,
		"sessionId":   sessionID,
		"sessionName": sessionName,
	})
	if err != nil {
		log.Printf("Error marshaling session created message: %v", err)
		return nil
	}
	return payload
}

func FormatJoinSession(sessionID, playerID string, existingPlayers []map[string]interface{}) []byte {
	response, err := json.Marshal(map[string]interface{}{
		"type":      SessionJoined,
		"sessionId": sessionID,
		"playerId":  playerID,
		"players":   existingPlayers,
	})
	if err != nil {
		log.Printf("Error marshaling session joined message: %v", err)
		return nil
	}
	return response
}

func FormatPlayerJoined(playerData map[string]interface{}) []byte {
	response, err := json.Marshal(map[string]interface{}{
		"type":   PlayerJoined,
		"player": playerData,
	})
	if err != nil {
		log.Printf("Error marshaling player joined message: %v", err)
		return nil
	}
	return response
}

func FormatPlayerUpdated(playerID string, position, rotation, modelRotation map[string]float64, animation string) []byte {
	response, err := json.Marshal(map[string]interface{}{
		"type":          PlayerUpdated,
		"id":            playerID,
		"position":      position,
		"rotation":      rotation,
		"modelRotation": modelRotation,
		"animation":     animation,
	})
	if err != nil {
		log.Printf("Error marshaling player updated message: %v", err)
		return nil
	}
	return response
}

func FormatPlaySound(playerID, soundType string, position map[string]float64) []byte {
	response, err := json.Marshal(map[string]interface{}{
		"type":      PlayerSound,
		"id":        playerID,
		"soundType": soundType,
		"position":  position,
	})
	if err != nil {
		log.Printf("Error marshaling play sound message: %v", err)
		return nil
	}
	return response
}
