const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enable compression
app.use(compression());

// Serve static files
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(__dirname));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', players: players.size });
});

// Player state management
const players = new Map();
const PLAYER_TIMEOUT = 30000; // 30 seconds
const UPDATE_RATE = 50; // 20 updates per second

// Player data structure
class Player {
  constructor(id) {
    this.id = id;
    this.username = null;
    this.position = { x: 0, y: 7.45, z: 0 };
    this.rotation = { y: 0 };
    this.animation = 'idle';
    this.lastUpdate = Date.now();
  }
}

// Broadcast to all clients except sender
function broadcast(ws, data) {
  wss.clients.forEach((client) => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Broadcast to all clients including sender
function broadcastToAll(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  const playerId = Math.random().toString(36).substr(2, 9);
  const player = new Player(playerId);
  players.set(playerId, player);
  
  ws.playerId = playerId;
  
  console.log(`Player ${playerId} connected. Total players: ${players.size}`);
  
  // Send player their ID and existing players (serialize properly)
  const existingPlayers = Array.from(players.values())
    .filter(p => p.id !== playerId)
    .map(p => ({
      id: p.id,
      username: p.username,
      position: p.position,
      rotation: p.rotation,
      animation: p.animation
    }));
  
  ws.send(JSON.stringify({
    type: 'init',
    id: playerId,
    players: existingPlayers
  }));
  
  // Don't broadcast playerJoined yet - wait for username first
  
  // Handle messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'setUsername') {
        // Set player username
        const player = players.get(playerId);
        if (player) {
          player.username = data.username;
          console.log(`Player ${playerId} set username to: ${data.username}`);
          
          // Create player data object to broadcast
          const playerData = {
            id: player.id,
            username: player.username,
            position: player.position,
            rotation: player.rotation,
            animation: player.animation
          };
          
          console.log('Broadcasting player joined:', playerData);
          
          // Now broadcast playerJoined with the full player info including username
          broadcast(ws, JSON.stringify({
            type: 'playerJoined',
            player: playerData
          }));
        }
      } else if (data.type === 'update') {
        // Update player state
        const player = players.get(playerId);
        if (player) {
          player.position = data.position;
          player.rotation = data.rotation;
          player.animation = data.animation;
          player.lastUpdate = Date.now();
          
          // Broadcast update to other players
          broadcast(ws, JSON.stringify({
            type: 'playerUpdate',
            id: playerId,
            position: data.position,
            rotation: data.rotation,
            animation: data.animation
          }));
        }
      } else if (data.type === 'sound') {
        // Broadcast sound to other players
        broadcast(ws, JSON.stringify({
          type: 'sound',
          id: playerId,
          soundType: data.soundType,
          position: data.position
        }));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    players.delete(playerId);
    console.log(`Player ${playerId} disconnected. Total players: ${players.size}`);
    
    // Notify others about player leaving
    broadcastToAll(JSON.stringify({
      type: 'playerLeft',
      id: playerId
    }));
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for player ${playerId}:`, error);
  });
});

// Clean up inactive players
setInterval(() => {
  const now = Date.now();
  players.forEach((player, id) => {
    if (now - player.lastUpdate > PLAYER_TIMEOUT) {
      players.delete(id);
      broadcastToAll(JSON.stringify({
        type: 'playerLeft',
        id: id
      }));
      console.log(`Player ${id} timed out`);
    }
  });
}, 10000); // Check every 10 seconds

const PORT = process.env.PORT || 5500;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`MMO Server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});
