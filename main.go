package main

import (
	"log"

	"net/http"

	"github.com/froemosen/GameJam-2025/internal/config"
	"github.com/froemosen/GameJam-2025/internal/handlers"
	"github.com/froemosen/GameJam-2025/internal/service"
)

func main() {
	config := config.LoadConfig()

	// Start cleanup goroutine
	go service.CleanupLoop()

	// Setup routes
	http.HandleFunc("/ws", handlers.HandleWebSocket)
	http.HandleFunc("/health", handlers.HealthHandler)

	// Serve static files
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)

	log.Printf("Go MMO Server running on port %s", config.Port)
	log.Printf("WebSocket endpoint: ws://localhost:%s/ws", config.Port)

	if err := http.ListenAndServe(":"+config.Port, nil); err != nil {
		log.Fatal("Server error:", err)
	}
}
