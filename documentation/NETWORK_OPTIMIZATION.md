# Network Optimization Guide

## Problem
High broadcast rate causing network saturation due to frequent player position updates.

## Industry-Standard Solutions Implemented

### 1. ✅ Reduced Update Rate (50% bandwidth reduction)
**Client-side: `src/multiplayer.js`**
- Changed from 20 Hz (every 50ms) to **10 Hz (every 100ms)**
- Industry standard: Most games use 10-20 Hz for position updates
- Examples:
  - Counter-Strike: 64 Hz (competitive servers)
  - Fortnite: 20-30 Hz
  - Most MMOs: 10-15 Hz

### 2. ✅ Delta Compression (30-50% reduction)
**Client-side: `src/multiplayer.js`**
- Only send updates when position/rotation changes significantly
- Thresholds:
  - Position: 0.01 units (1cm) - ignores micro-movements
  - Rotation: 0.05 radians (~3 degrees)
  - Animation: Only on state change
- Result: Standing still = 0 updates, smooth movement = 10 updates/sec

### 3. ✅ Spatial Partitioning / Area of Interest (60-80% reduction)
**Server-side: `internal/spatial/grid.go`, `internal/handlers/player.go`**
- Divides world into 50x50 unit grid cells
- Players only receive updates from others within **100 unit radius**
- Example: 10 players in world, only 3 nearby = 70% fewer messages

**How it works:**
```
Before: Player moves → broadcast to ALL 9 other players = 9 messages
After:  Player moves → broadcast to 2 nearby players = 2 messages
Savings: 78% reduction in messages
```

### 4. ✅ Client-Side Interpolation (smoothness)
**Client-side: `src/multiplayer.js` - `update()` method**
- Already implemented with lerp (linear interpolation)
- Smoothly moves players between received positions
- Allows lower update rates without jittery movement
- Interpolation factor: 0.3 (30% per frame = smooth catch-up)

## Expected Results

### Before Optimization
- 4 players, 20 Hz updates, full broadcast
- **Per player:** 20 updates/sec × 3 other players = 60 messages/sec received
- **Total network:** 4 × 60 = 240 messages/sec
- **Bandwidth:** ~500 KB/sec (assuming 2KB per message)

### After Optimization
- 10 Hz + delta compression + spatial partitioning
- **Per player:** ~5 updates/sec × 1.5 nearby players = 7.5 messages/sec received
- **Total network:** 4 × 7.5 = 30 messages/sec
- **Bandwidth:** ~60 KB/sec
- **Savings: 87.5% reduction** 🎉

## Configuration

### Adjust Update Rate
**File:** `src/multiplayer.js` line ~532
```javascript
this.updateInterval = setInterval(() => {
  this.sendUpdate();
}, 100); // Change to 50 for 20Hz, 200 for 5Hz
```

### Adjust Delta Thresholds
**File:** `src/multiplayer.js` line ~27
```javascript
this.positionThreshold = 0.01; // Smaller = more updates
this.rotationThreshold = 0.05; // Smaller = more updates
```

### Adjust Spatial Grid
**File:** `internal/service/session.go` line ~37
```javascript
Grid: spatial.NewGrid(50.0, 100.0)
// First param: cell size (smaller = more precise, more overhead)
// Second param: view distance (larger = more players visible)
```

**Tuning guidelines:**
- **Small fast-paced arena:** 25 cell size, 50 view distance
- **Medium battle royale:** 50 cell size, 100 view distance (current)
- **Large open world MMO:** 100 cell size, 150 view distance

## Testing

### Monitor Metrics
```bash
# Run analysis script
python3 analyze-metrics.py

# Or use Grafana dashboard
open http://localhost:3000
```

### Key Metrics to Watch
1. **Message Rate by Type** - Should see playerUpdate drop significantly
2. **Broadcast Recipients** - Should be lower than player count
3. **Bandwidth** - Should be <200 KB/sec for most games
4. **Active Connections** - Confirm player count

### Performance Targets
✅ **Good:** <100 messages/sec total, <200 KB/sec bandwidth
⚠️ **Acceptable:** 100-200 messages/sec, 200-500 KB/sec
❌ **Problem:** >200 messages/sec, >500 KB/sec

## Advanced Optimizations (Future)

### 5. Message Batching
Combine multiple small messages into one larger message
- **Savings:** 20-30% (reduces packet overhead)
- **Implementation:** Buffer updates for 100ms, send as array

### 6. Binary Protocol (Protobuf/MessagePack)
Replace JSON with binary encoding
- **Savings:** 40-60% (binary is much more compact)
- **Trade-off:** More complex implementation

### 7. Client Prediction
Client predicts other players' movement
- **Benefit:** Can reduce update rate to 5 Hz
- **Trade-off:** More complex, requires movement prediction

### 8. Snapshot Compression
Send full state occasionally, deltas in between
- **Savings:** 30-50% for games with many entities
- **Example:** Full state every 1 second, deltas every 100ms

## How Real Games Handle This

### Fortnite
- 20-30 Hz tick rate
- Aggressive client prediction
- Spatial partitioning (players load/unload based on distance)
- Delta compression

### Counter-Strike: GO
- 64-128 Hz tick rate (competitive)
- Very small messages (binary protocol)
- Lag compensation
- Client-side prediction

### World of Warcraft
- 10-15 Hz for position updates
- Aggressive Area of Interest (AOI) filtering
- Different update rates for different entity types
- Spell effects batched

## Troubleshooting

### Players rubber-banding
- Increase update rate (50ms instead of 100ms)
- Increase interpolation factor (0.5 instead of 0.3)

### Players not seeing each other
- Increase view distance in spatial grid
- Check grid cell size (may be too large)

### Still high bandwidth
- Check delta compression thresholds (may be too sensitive)
- Verify spatial partitioning is working (check metrics)
- Consider binary protocol

### Players lag behind
- Reduce interpolation factor (0.2 instead of 0.3)
- Implement client prediction

## Summary

✅ **Update Rate:** 20 Hz → 10 Hz (-50%)
✅ **Delta Compression:** Skip unchanged states (-30-50%)
✅ **Spatial Partitioning:** Only nearby players (-60-80%)
✅ **Client Interpolation:** Smooth movement at low rates

**Combined Result:** ~87% bandwidth reduction while maintaining smooth gameplay!
