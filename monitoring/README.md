# Game Server Monitoring

This directory contains the monitoring stack for the WebSocket game server.

## Overview

The monitoring stack includes:
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Node Exporter**: System-level metrics

## Quick Start

### 1. Start the Monitoring Stack

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

### 2. Access the Dashboards

- **Grafana**: http://localhost:3000
  - Username: `admin`
  - Password: `admin`
  - Default dashboard: "Game WebSocket Metrics"

- **Prometheus**: http://localhost:9090
  - Query interface for raw metrics

### 3. View Your Game Server Metrics

The game server exposes metrics at: http://localhost:5500/metrics

## Metrics Collected

### Connection Metrics
- `websocket_active_connections` - Current number of active WebSocket connections
- `websocket_total_connections` - Total connections established since server start
- `websocket_connection_errors_total` - Connection errors

### Message Metrics
- `websocket_messages_received_total{type}` - Messages received by type (update, sound, joinSession, etc.)
- `websocket_messages_sent_total{type}` - Messages sent by type
- `websocket_message_send_errors_total{type}` - Failed message sends
- `websocket_message_processing_duration_seconds{type}` - Time to process messages

### Session Metrics
- `game_active_sessions` - Current number of active game sessions
- `game_total_sessions` - Total sessions created
- `game_players_per_session` - Distribution of players per session

### Broadcast Metrics
- `websocket_broadcasts_sent_total{type}` - Number of broadcast messages
- `websocket_broadcast_recipients` - Number of recipients per broadcast

### Bandwidth Metrics
- `websocket_bytes_sent_total` - Total bytes sent
- `websocket_bytes_received_total` - Total bytes received

## Dashboard Panels

The Grafana dashboard includes:

1. **Active Connections** - Real-time connection count
2. **Current Connections (Gauge)** - Visual gauge of connections with thresholds
3. **Active Game Sessions** - Number of active game sessions
4. **Messages Received/Second** - By message type (stacked)
5. **Messages Sent/Second** - By message type (stacked)
6. **Network Bandwidth** - Bytes sent/received per second
7. **Broadcast Rate** - Broadcasts per second
8. **Message Processing Duration** - 95th and 99th percentile latency
9. **Broadcast Recipients** - Distribution of broadcast sizes
10. **Errors** - Connection and send errors

## Analyzing Performance Issues

### High Message Rate
If you see abnormally high message rates:
1. Check the "Messages Sent/Second" panel to identify which message type
2. Look at "Broadcast Recipients" to see if broadcasts are going to too many players
3. Check "Message Processing Duration" to see if processing is slow

### High Bandwidth Usage
If bandwidth is high:
1. Check "Network Bandwidth" panel
2. Correlate with "Messages Sent/Second" to identify which message types
3. Consider reducing update frequency or optimizing message payloads

### Performance Degradation
1. Check "Message Processing Duration" for slow message types
2. Look at "Active Connections" to see if scale is an issue
3. Check system metrics in Node Exporter dashboard

## Custom Queries

Access Prometheus at http://localhost:9090 to run custom queries:

```promql
# Message rate by type over last 5 minutes
rate(websocket_messages_sent_total[5m])

# Average broadcast size
rate(websocket_broadcast_recipients_sum[5m]) / rate(websocket_broadcast_recipients_count[5m])

# Error rate
rate(websocket_message_send_errors_total[1m])

# Total bandwidth (MB/s)
(rate(websocket_bytes_sent_total[1m]) + rate(websocket_bytes_received_total[1m])) / 1024 / 1024
```

## Stopping the Monitoring Stack

```bash
docker-compose -f docker-compose.monitoring.yml down
```

To remove all data:
```bash
docker-compose -f docker-compose.monitoring.yml down -v
```

## Troubleshooting

### Prometheus can't reach game server
- Ensure game server is running on localhost:5500
- Check that `/metrics` endpoint is accessible: `curl http://localhost:5500/metrics`
- On macOS/Windows, Prometheus uses `host.docker.internal` to reach host

### Grafana shows "No Data"
- Wait 15-30 seconds for first scrape
- Check Prometheus targets at http://localhost:9090/targets
- Verify data source configuration in Grafana

### High CPU usage
- Reduce scrape frequency in `prometheus.yml`
- Current scrape interval: 5s for game server, 10s for node exporter
