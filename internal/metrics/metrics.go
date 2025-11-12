package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// WebSocket connection metrics
	ActiveConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "websocket_active_connections",
		Help: "Number of active WebSocket connections",
	})

	TotalConnections = promauto.NewCounter(prometheus.CounterOpts{
		Name: "websocket_total_connections",
		Help: "Total number of WebSocket connections established",
	})

	ConnectionErrors = promauto.NewCounter(prometheus.CounterOpts{
		Name: "websocket_connection_errors_total",
		Help: "Total number of WebSocket connection errors",
	})

	// Message metrics
	MessagesReceived = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "websocket_messages_received_total",
		Help: "Total number of WebSocket messages received by type",
	}, []string{"type"})

	MessagesSent = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "websocket_messages_sent_total",
		Help: "Total number of WebSocket messages sent by type",
	}, []string{"type"})

	MessageSendErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "websocket_message_send_errors_total",
		Help: "Total number of WebSocket message send errors by type",
	}, []string{"type"})

	MessageProcessingDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "websocket_message_processing_duration_seconds",
		Help:    "Time spent processing WebSocket messages",
		Buckets: prometheus.DefBuckets,
	}, []string{"type"})

	// Session metrics
	ActiveSessions = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "game_active_sessions",
		Help: "Number of active game sessions",
	})

	TotalSessions = promauto.NewCounter(prometheus.CounterOpts{
		Name: "game_total_sessions",
		Help: "Total number of game sessions created",
	})

	PlayersPerSession = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "game_players_per_session",
		Help:    "Number of players per session",
		Buckets: []float64{1, 2, 3, 4, 5, 10, 20, 50},
	})

	// Broadcast metrics
	BroadcastsSent = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "websocket_broadcasts_sent_total",
		Help: "Total number of broadcast messages sent",
	}, []string{"type"})

	BroadcastRecipients = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "websocket_broadcast_recipients",
		Help:    "Number of recipients per broadcast",
		Buckets: []float64{1, 2, 5, 10, 20, 50, 100},
	})

	// Performance metrics
	MessageQueueSize = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "websocket_message_queue_size",
		Help: "Current size of message queue",
	})

	// Bandwidth metrics
	BytesReceived = promauto.NewCounter(prometheus.CounterOpts{
		Name: "websocket_bytes_received_total",
		Help: "Total bytes received via WebSocket",
	})

	BytesSent = promauto.NewCounter(prometheus.CounterOpts{
		Name: "websocket_bytes_sent_total",
		Help: "Total bytes sent via WebSocket",
	})
)
