package utils

import (
	"math/rand"
	"time"
)

// Generate random session ID (6 characters, no confusing chars)
func GenerateSessionID() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No 0, O, I, 1
	rand.Seed(time.Now().UnixNano())
	b := make([]byte, 6)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

// Generate random player ID
func GeneratePlayerID() string {
	rand.Seed(time.Now().UnixNano())
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 9)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}
