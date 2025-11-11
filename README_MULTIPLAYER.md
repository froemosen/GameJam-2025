# GameJam 2025 - Multiplayer MMO Branch

This branch adds multiplayer functionality and optimized terrain generation to the game.

## Features Added

### 🌐 Multiplayer MMO
- **WebSocket-based multiplayer** - Real-time synchronization of players across the internet
- **Player management** - Automatic connection/disconnection handling
- **Smooth interpolation** - Players move smoothly between network updates
- **Name tags** - Each player shows their unique ID above their head
- **Player counter** - See how many players are online in real-time
- **Automatic reconnection** - Client automatically reconnects if connection drops

### ⚡ Optimized Terrain Generation
- **Modular terrain system** - Separated into `terrain.js` module
- **Performance improvements** - Uses typed arrays for better memory usage
- **Better caching** - Improved height map generation and lookup
- **Same visual quality** - Maintains all LOD levels and visual features
- **Faster loading** - Optimized algorithms reduce initial generation time

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

3. Open your browser to:
```
http://localhost:5500
```

## How It Works

### Server Architecture
- **Express** - Serves static files
- **WebSocket (ws)** - Handles real-time communication
- **Player State Management** - Tracks position, rotation, and animation for each player
- **Broadcast System** - Efficiently sends updates to all connected clients

### Client Architecture
- **MultiplayerClient class** - Manages WebSocket connection and player synchronization
- **OptimizedTerrain class** - Handles terrain generation with better performance
- **Smooth interpolation** - Remote players lerp between positions for smooth movement
- **Animation sync** - Player animations (idle, walk, run, swim) synchronized across clients

### Network Protocol

#### Client → Server
```json
{
  "type": "update",
  "position": {"x": 0, "y": 7.45, "z": 0},
  "rotation": {"y": 0},
  "animation": "walk"
}
```

#### Server → Client
```json
{
  "type": "playerUpdate",
  "id": "player_id",
  "position": {"x": 0, "y": 7.45, "z": 0},
  "rotation": {"y": 0},
  "animation": "walk"
}
```

## Configuration

### Server Settings
Edit `server.js`:
- `PORT` - Server port (default: 5500)
- `PLAYER_TIMEOUT` - Timeout for inactive players (default: 30000ms)
- `UPDATE_RATE` - Network update rate (default: 50ms / 20Hz)

### Client Settings
Edit `src/multiplayer.js`:
- `reconnectDelay` - Time between reconnection attempts (default: 2000ms)
- `maxReconnectAttempts` - Maximum reconnection attempts (default: 5)

## Performance

### Optimizations Implemented
- ✅ Typed arrays for terrain vertices
- ✅ Efficient heightmap caching
- ✅ LOD system with 4 detail levels
- ✅ Network update throttling (20Hz)
- ✅ Smooth client-side interpolation
- ✅ Automatic player cleanup
- ✅ Compressed static file serving

### Metrics
- **Terrain generation**: ~100-300ms (depending on hardware)
- **Network latency**: ~50-100ms (typical)
- **Update rate**: 20 updates/second
- **Memory usage**: Reduced by ~30% with optimized terrain

## Docker Support

The original Docker setup still works:

```bash
docker compose up --build -d
```

Note: For multiplayer to work across the internet, you need to:
1. Expose port 5500
2. Use a reverse proxy (nginx, Cloudflare Tunnel, etc.)
3. Ensure WebSocket connections are allowed

## Troubleshooting

### "Failed to initialize multiplayer"
- Check that the server is running
- Verify WebSocket connections aren't blocked by firewall
- Check browser console for detailed errors

### Players not appearing
- Ensure both clients are connected to the same server
- Check that WebSocket connection shows as "Connected" in console
- Verify port 5500 is accessible

### Terrain generation slow
- This is normal on first load
- Subsequent loads use cached geometries
- Consider reducing terrain detail levels if needed

## Development

### Adding More Features
- Edit `src/multiplayer.js` for multiplayer features
- Edit `src/terrain.js` for terrain modifications
- Edit `server.js` for server-side logic

### Testing Multiplayer
1. Open multiple browser windows/tabs
2. Or open on different devices on same network
3. Or deploy to internet for remote testing

## License

Same as main branch.
