package config

import (
	"os"
	"time"
)

const (
	// WebSocket connection timeouts
	ReadTimeout = 60 * time.Second // How long to wait for client messages/pong
	PingRate    = 30 * time.Second // How often to send ping to client

	// Session cleanup
	CleanupInterval = 5 * time.Minute // How often to check for stale sessions
)

type Config struct {
	Port string
}

func LoadConfig() *Config {
	config := &Config{
		Port: "5500",
	}

	if os.Getenv("PORT") != "" {
		config.Port = os.Getenv("PORT")
	}

	return config
}
