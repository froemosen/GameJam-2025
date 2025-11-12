#!/bin/bash

# Script to analyze WebSocket metrics and identify performance issues

echo "🔍 Analyzing Game Server Metrics..."
echo ""

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROMETHEUS_URL="http://localhost:9090/api/v1/query"

# Function to query Prometheus
query_prometheus() {
    local query=$1
    curl -s -G --data-urlencode "query=$query" "$PROMETHEUS_URL" | jq -r '.data.result[0].value[1]' 2>/dev/null
}

# Function to query Prometheus with labels
query_prometheus_with_labels() {
    local query=$1
    curl -s -G --data-urlencode "query=$query" "$PROMETHEUS_URL" | jq -r '.data.result[] | "\(.metric.type // "N/A"): \(.value[1])"' 2>/dev/null
}

# Check if Prometheus is accessible
if ! curl -s "$PROMETHEUS_URL" > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to Prometheus at $PROMETHEUS_URL${NC}"
    echo "Make sure the monitoring stack is running:"
    echo "  docker-compose -f docker-compose.monitoring.yml up -d"
    exit 1
fi

echo -e "${GREEN}✅ Connected to Prometheus${NC}"
echo ""

# 1. Connection Analysis
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📡 CONNECTION ANALYSIS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

active_connections=$(query_prometheus "websocket_active_connections")
total_connections=$(query_prometheus "websocket_total_connections")
connection_errors=$(query_prometheus "websocket_connection_errors_total")

echo "Active Connections: ${active_connections:-0}"
echo "Total Connections: ${total_connections:-0}"
echo "Connection Errors: ${connection_errors:-0}"

if (( $(echo "$active_connections > 50" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "${YELLOW}⚠️  High number of active connections${NC}"
fi

echo ""

# 2. Message Rate Analysis
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📨 MESSAGE RATE ANALYSIS (last 1 minute)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "Messages Received/sec by type:"
query_prometheus_with_labels "rate(websocket_messages_received_total[1m])" | while read -r line; do
    if [ -n "$line" ]; then
        type=$(echo "$line" | cut -d: -f1)
        rate=$(echo "$line" | cut -d: -f2 | xargs)
        echo "  $type: $rate/sec"
        
        # Check for high update rates
        if [[ "$type" == "update" ]] && (( $(echo "$rate > 20" | bc -l 2>/dev/null || echo 0) )); then
            echo -e "    ${RED}🚨 CRITICAL: Update rate too high! This is likely causing network congestion${NC}"
            echo -e "    ${YELLOW}💡 Recommendation: Reduce update frequency or implement throttling${NC}"
        fi
    fi
done

echo ""
echo "Messages Sent/sec by type:"
query_prometheus_with_labels "rate(websocket_messages_sent_total[1m])" | while read -r line; do
    if [ -n "$line" ]; then
        type=$(echo "$line" | cut -d: -f1)
        rate=$(echo "$line" | cut -d: -f2 | xargs)
        echo "  $type: $rate/sec"
        
        if [[ "$type" == "playerUpdate" ]] && (( $(echo "$rate > 50" | bc -l 2>/dev/null || echo 0) )); then
            echo -e "    ${RED}🚨 CRITICAL: PlayerUpdate broadcast rate extremely high!${NC}"
            echo -e "    ${YELLOW}💡 This is multiplied by number of players - major bandwidth issue${NC}"
        fi
    fi
done

echo ""

# 3. Bandwidth Analysis
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🌐 BANDWIDTH ANALYSIS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

bytes_sent_rate=$(query_prometheus "rate(websocket_bytes_sent_total[1m])")
bytes_recv_rate=$(query_prometheus "rate(websocket_bytes_received_total[1m])")

if [ -n "$bytes_sent_rate" ] && [ "$bytes_sent_rate" != "null" ]; then
    kb_sent=$(echo "scale=2; $bytes_sent_rate / 1024" | bc)
    mb_sent=$(echo "scale=2; $bytes_sent_rate / 1024 / 1024" | bc)
    echo "Bytes Sent: ${kb_sent} KB/sec (${mb_sent} MB/sec)"
    
    if (( $(echo "$mb_sent > 1" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${RED}🚨 CRITICAL: Sending over 1 MB/sec!${NC}"
        echo -e "${YELLOW}💡 This will saturate most home internet connections${NC}"
    elif (( $(echo "$kb_sent > 500" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${YELLOW}⚠️  Warning: High bandwidth usage (>500 KB/sec)${NC}"
    fi
fi

if [ -n "$bytes_recv_rate" ] && [ "$bytes_recv_rate" != "null" ]; then
    kb_recv=$(echo "scale=2; $bytes_recv_rate / 1024" | bc)
    echo "Bytes Received: ${kb_recv} KB/sec"
fi

echo ""

# 4. Broadcast Analysis
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📢 BROADCAST ANALYSIS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

broadcast_rate=$(query_prometheus "rate(websocket_broadcasts_sent_total[1m])")
avg_recipients=$(query_prometheus "rate(websocket_broadcast_recipients_sum[1m]) / rate(websocket_broadcast_recipients_count[1m])")

echo "Broadcast Rate: ${broadcast_rate:-0}/sec"
echo "Average Recipients per Broadcast: ${avg_recipients:-0}"

if [ -n "$broadcast_rate" ] && [ -n "$avg_recipients" ]; then
    total_messages=$(echo "scale=2; $broadcast_rate * $avg_recipients" | bc 2>/dev/null)
    echo "Effective Message Rate: ${total_messages:-0} messages/sec"
    
    if (( $(echo "$total_messages > 100" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${RED}🚨 CRITICAL: Effective message rate extremely high!${NC}"
        echo -e "${YELLOW}💡 Each broadcast multiplies by player count - this is your bottleneck${NC}"
    fi
fi

echo ""

# 5. Performance Analysis
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}⚡ PERFORMANCE ANALYSIS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "Message Processing Duration (95th percentile):"
query_prometheus_with_labels "histogram_quantile(0.95, rate(websocket_message_processing_duration_seconds_bucket[5m]))" | while read -r line; do
    if [ -n "$line" ]; then
        type=$(echo "$line" | cut -d: -f1)
        duration=$(echo "$line" | cut -d: -f2 | xargs)
        ms=$(echo "scale=2; $duration * 1000" | bc 2>/dev/null)
        echo "  $type: ${ms}ms"
        
        if (( $(echo "$ms > 100" | bc -l 2>/dev/null || echo 0) )); then
            echo -e "    ${YELLOW}⚠️  Slow processing (>100ms)${NC}"
        fi
    fi
done

echo ""

# 6. Session Analysis
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🎮 SESSION ANALYSIS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

active_sessions=$(query_prometheus "game_active_sessions")
total_sessions=$(query_prometheus "game_total_sessions")

echo "Active Sessions: ${active_sessions:-0}"
echo "Total Sessions Created: ${total_sessions:-0}"

echo ""

# 7. Error Analysis
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}❌ ERROR ANALYSIS (last 5 minutes)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

connection_error_rate=$(query_prometheus "rate(websocket_connection_errors_total[5m])")
echo "Connection Error Rate: ${connection_error_rate:-0}/sec"

echo "Message Send Errors by type:"
query_prometheus_with_labels "rate(websocket_message_send_errors_total[5m])" | while read -r line; do
    if [ -n "$line" ] && [ "$line" != ": 0" ]; then
        echo "  $line/sec"
    fi
done

echo ""

# 8. Recommendations
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}💡 RECOMMENDATIONS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check update frequency
update_rate=$(curl -s -G --data-urlencode "query=rate(websocket_messages_received_total{type=\"update\"}[1m])" "$PROMETHEUS_URL" | jq -r '.data.result[0].value[1]' 2>/dev/null)

if [ -n "$update_rate" ] && [ "$update_rate" != "null" ]; then
    if (( $(echo "$update_rate > 20" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${YELLOW}1. Reduce client update rate:${NC}"
        echo "   - Current: ~${update_rate}/sec"
        echo "   - Recommended: 10-20 updates/sec (60-100ms interval)"
        echo "   - Location: Check src/multiplayer.js updateInterval"
        echo ""
    fi
fi

# Check broadcast rate
if [ -n "$broadcast_rate" ] && (( $(echo "$broadcast_rate > 30" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "${YELLOW}2. Optimize broadcasts:${NC}"
    echo "   - Consider spatial partitioning (only send to nearby players)"
    echo "   - Implement interest management"
    echo "   - Throttle position updates when player not moving much"
    echo ""
fi

# Check bandwidth
if [ -n "$mb_sent" ] && (( $(echo "$mb_sent > 0.5" | bc -l 2>/dev/null || echo 0) )); then
    echo -e "${YELLOW}3. Reduce message size:${NC}"
    echo "   - Use binary protocols instead of JSON"
    echo "   - Send only changed fields (delta updates)"
    echo "   - Compress rotation/position data (fewer decimal places)"
    echo ""
fi

echo -e "${GREEN}📊 View detailed metrics in Grafana: http://localhost:3000${NC}"
echo -e "${GREEN}🔍 Query metrics directly: http://localhost:9090${NC}"
echo ""
