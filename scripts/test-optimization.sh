#!/bin/bash

echo "🚀 Network Optimization Test Script"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📋 Changes Applied:"
echo "  ✅ Update rate: 20 Hz → 10 Hz"
echo "  ✅ Delta compression implemented"
echo "  ✅ Spatial partitioning (100 unit radius)"
echo "  ✅ Client interpolation (already present)"
echo ""

echo "🔍 Checking files..."
echo ""

# Check if spatial grid was created
if [ -f "internal/spatial/grid.go" ]; then
    echo -e "${GREEN}✓${NC} Spatial grid created (internal/spatial/grid.go)"
else
    echo -e "${RED}✗${NC} Spatial grid missing!"
fi

# Check if multiplayer.js was updated
if grep -q "positionThreshold" src/multiplayer.js; then
    echo -e "${GREEN}✓${NC} Delta compression added to multiplayer.js"
else
    echo -e "${RED}✗${NC} Delta compression not found!"
fi

# Check update rate
UPDATE_INTERVAL=$(grep -A 1 "startUpdateLoop" src/multiplayer.js | grep "setInterval" | grep -o "[0-9]\+")
if [ "$UPDATE_INTERVAL" = "100" ]; then
    echo -e "${GREEN}✓${NC} Update rate set to 10 Hz (100ms)"
else
    echo -e "${YELLOW}⚠${NC} Update interval is ${UPDATE_INTERVAL}ms"
fi

# Check if server compiled
if [ -f "game-server" ]; then
    echo -e "${GREEN}✓${NC} Server binary compiled successfully"
else
    echo -e "${RED}✗${NC} Server binary not found - run: go build -o game-server ."
fi

echo ""
echo "📊 Expected Performance Improvements:"
echo "  • Message rate: ~87% reduction"
echo "  • Bandwidth: ~500 KB/sec → ~60 KB/sec"
echo "  • Broadcasts: Only to nearby players"
echo ""

echo "🧪 Testing Instructions:"
echo "  1. Start the server: ./game-server"
echo "  2. Open game in 4+ browser tabs"
echo "  3. Move players around"
echo "  4. Run: python3 analyze-metrics.py"
echo ""

echo "📈 Monitor with:"
echo "  • Grafana: http://localhost:3000 (admin/admin)"
echo "  • Prometheus: http://localhost:9090"
echo "  • Analysis: python3 analyze-metrics.py"
echo ""

echo "💡 Tips:"
echo "  • Players far apart (>100 units) won't see each other"
echo "  • Standing still sends 0 updates (delta compression)"
echo "  • Check broadcast recipients in metrics (should be <player count)"
echo ""

echo "📖 Full documentation: NETWORK_OPTIMIZATION.md"
