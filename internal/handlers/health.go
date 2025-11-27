package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/froemosen/GameJam-2025/internal/service"
)

// Health check endpoint
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	playerCount, sessionCount := service.State.GetCounts()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "healthy",
		"players":  playerCount,
		"sessions": sessionCount,
	})
}
