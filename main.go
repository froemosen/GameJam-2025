package main

import (
	"log"
	"net/http"

	"github.com/froemosen/GameJam-2025/internal/config"
	"github.com/froemosen/GameJam-2025/internal/handlers"
	"github.com/froemosen/GameJam-2025/internal/service"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	config := config.LoadConfig()

	// Start cleanup goroutine
	go service.CleanupLoop()

	// Setup routes
	http.HandleFunc("/ws", handlers.HandleWebSocket)
	http.HandleFunc("/health", handlers.HealthHandler)
	http.Handle("/metrics", promhttp.Handler())

	// Serve static files
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)

	log.Printf("Go MMO Server running on port %s", config.Port)
	log.Printf("WebSocket endpoint: ws://localhost:%s/ws", config.Port)
	log.Printf("Metrics endpoint: http://localhost:%s/metrics", config.Port)

	if err := http.ListenAndServe(":"+config.Port, nil); err != nil {
		log.Fatal("Server error:", err)
	}
}
