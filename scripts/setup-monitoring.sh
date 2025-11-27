#!/bin/bash

# Script to set up and start the monitoring stack

echo "🚀 Setting up Game Server Monitoring..."

# Step 1: Update Go dependencies
echo "📦 Updating Go dependencies..."
go mod tidy

# Step 2: Rebuild the game server
echo "🔨 Rebuilding game server with metrics..."
docker-compose down
docker-compose build

# Step 3: Start the game server
echo "🎮 Starting game server..."
docker-compose up -d

# Wait for game server to be ready
echo "⏳ Waiting for game server to be ready..."
sleep 5

# Check if game server is running
if curl -s http://localhost:5500/health > /dev/null; then
    echo "✅ Game server is running"
else
    echo "❌ Game server failed to start"
    exit 1
fi

# Check if metrics endpoint is available
if curl -s http://localhost:5500/metrics > /dev/null; then
    echo "✅ Metrics endpoint is available"
else
    echo "❌ Metrics endpoint not available"
    exit 1
fi

# Step 4: Start the monitoring stack
echo "📊 Starting monitoring stack (Prometheus + Grafana)..."
docker-compose -f docker-compose.monitoring.yml up -d

# Wait for Grafana to be ready
echo "⏳ Waiting for Grafana to be ready..."
sleep 10

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📌 Access points:"
echo "   Game Server:  http://localhost:5500"
echo "   Metrics:      http://localhost:5500/metrics"
echo "   Grafana:      http://localhost:3000 (admin/admin)"
echo "   Prometheus:   http://localhost:9090"
echo ""
echo "💡 To view metrics:"
echo "   1. Open Grafana at http://localhost:3000"
echo "   2. Login with admin/admin"
echo "   3. Go to Dashboards -> Game WebSocket Metrics"
echo ""
echo "📚 For more info, see monitoring/README.md"
