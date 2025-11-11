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

// Session and player state management
const sessions = new Map();
const players = new Map();
const PLAYER_TIMEOUT = 30000; // 30 seconds
const UPDATE_RATE = 50; // 20 updates per second
const SESSION_TIMEOUT = 3600000; // 1 hour

// Session data structure
class GameSession {
  constructor(id, name, creatorId) {
    this.id = id;
    this.name = name;
    this.creatorId = creatorId;
    this.players = new Set();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }
  
  addPlayer(playerId) {
    this.players.add(playerId);
    this.lastActivity = Date.now();
  }
  
  removePlayer(playerId) {
    this.players.delete(playerId);
    this.lastActivity = Date.now();
  }
  
  getPlayerCount() {
    return this.players.size;
  }
  
  isEmpty() {
    return this.players.size === 0;
  }
}

// Player data structure
class Player {
  constructor(id) {
    this.id = id;
    this.username = null;
    this.sessionId = null;
    this.position = { x: 0, y: 7.45, z: 0 };
    this.rotation = { y: 0 };
    this.modelRotation = { y: 0 };
    this.animation = 'idle';
    this.lastUpdate = Date.now();
  }
}

// Generate unique session ID
function generateSessionId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Broadcast to all clients in same session except sender
function broadcast(ws, data, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  wss.clients.forEach((client) => {
    if (client !== ws && 
        client.readyState === WebSocket.OPEN && 
        client.sessionId === sessionId) {
      client.send(data);
    }
  });
}

// Broadcast to all clients in same session including sender
function broadcastToSession(sessionId, data) {
  const session = sessions.get(sessionId);
  if (!session) return;
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.sessionId === sessionId) {
      client.send(data);
    }
  });
}

// Broadcast to all clients (for menu updates)
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
  
  ws.playerId = playerId;
  ws.sessionId = null;
  ws.isInGame = false;
  
  console.log(`Client ${playerId} connected. Total connections: ${wss.clients.size}`);
  
  // Client starts in menu mode (not in game yet)
  
  // Handle messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Menu-related messages
      if (data.type === 'listSessions') {
        const sessionList = Array.from(sessions.values()).map(s => ({
          id: s.id,
          name: s.name,
          playerCount: s.getPlayerCount()
        }));
        ws.send(JSON.stringify({
          type: 'sessionList',
          sessions: sessionList
        }));
      } else if (data.type === 'createSession') {
        const sessionId = generateSessionId();
        const session = new GameSession(sessionId, data.sessionName, playerId);
        sessions.set(sessionId, session);
        
        console.log(`Session ${sessionId} created: ${data.sessionName}`);
        
        ws.send(JSON.stringify({
          type: 'sessionCreated',
          sessionId: sessionId,
          sessionName: data.sessionName
        }));
      } else if (data.type === 'joinSession') {
        const session = sessions.get(data.sessionId);
        
        if (!session) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Session not found. Please check the ID and try again.'
          }));
          return;
        }
        
        // Join the session
        ws.sessionId = data.sessionId;
        ws.isInGame = true;
        
        // Create player object now
        const player = new Player(playerId);
        player.sessionId = data.sessionId;
        players.set(playerId, player);
        
        session.addPlayer(playerId);
        
        console.log(`Player ${playerId} joined session ${data.sessionId}`);
        
        // Send existing players in THIS session
        const existingPlayers = Array.from(players.values())
          .filter(p => p.sessionId === data.sessionId && p.id !== playerId)
          .map(p => ({
            id: p.id,
            username: p.username,
            position: p.position,
            rotation: p.rotation,
            modelRotation: p.modelRotation,
            animation: p.animation
          }));
        
        ws.send(JSON.stringify({
          type: 'sessionJoined',
          sessionId: data.sessionId,
          playerId: playerId,
          players: existingPlayers
        }));
      } else if (data.type === 'setUsername') {
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
            modelRotation: player.modelRotation,
            animation: player.animation
          };
          
          console.log('Broadcasting player joined:', playerData);
          
          // Now broadcast playerJoined with the full player info including username (only to same session)
          if (ws.sessionId) {
            broadcast(ws, JSON.stringify({
              type: 'playerJoined',
              player: playerData
            }), ws.sessionId);
          }
        } else {
          console.warn(`Player ${playerId} not found when setting username - may not have joined session yet`);
        }
      } else if (data.type === 'update') {
        // Update player state
        const player = players.get(playerId);
        if (player && ws.sessionId) {
          player.position = data.position;
          player.rotation = data.rotation;
          player.modelRotation = data.modelRotation || { y: 0 };
          player.animation = data.animation;
          player.lastUpdate = Date.now();
          
          // Broadcast update to other players in same session
          broadcast(ws, JSON.stringify({
            type: 'playerUpdate',
            id: playerId,
            position: data.position,
            rotation: data.rotation,
            modelRotation: data.modelRotation || { y: 0 },
            animation: data.animation
          }), ws.sessionId);
        }
      } else if (data.type === 'sound') {
        // Broadcast sound to other players in same session
        if (ws.sessionId) {
          broadcast(ws, JSON.stringify({
            type: 'sound',
            id: playerId,
            soundType: data.soundType,
            position: data.position
          }), ws.sessionId);
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    const player = players.get(playerId);
    players.delete(playerId);
    console.log(`Player ${playerId} disconnected. Total players: ${players.size}`);
    
    // If player was in a game session, remove them and notify session
    if (player && player.sessionId) {
      const session = sessions.get(player.sessionId);
      if (session) {
        session.players.delete(playerId);
        console.log(`Player ${playerId} removed from session ${player.sessionId}. Session players: ${session.players.size}`);
        
        // Notify other players in the session
        broadcastToSession(player.sessionId, JSON.stringify({
          type: 'playerLeft',
          id: playerId
        }));
        
        // Clean up empty sessions
        if (session.players.size === 0) {
          sessions.delete(player.sessionId);
          console.log(`Session ${player.sessionId} deleted (empty)`);
        }
      }
    }
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
      
      // If player was in a session, remove them and notify
      if (player.sessionId) {
        const session = sessions.get(player.sessionId);
        if (session) {
          session.players.delete(id);
          broadcastToSession(player.sessionId, JSON.stringify({
            type: 'playerLeft',
            id: id
          }));
          
          // Clean up empty sessions
          if (session.players.size === 0) {
            sessions.delete(player.sessionId);
            console.log(`Session ${player.sessionId} deleted (empty after timeout)`);
          }
        }
      }
      
      console.log(`Player ${id} timed out`);
    }
  });
  
  // Clean up old inactive sessions (no players for 1 hour)
  sessions.forEach((session, sessionId) => {
    if (session.players.size === 0 && now - session.lastActivity > 3600000) {
      sessions.delete(sessionId);
      console.log(`Session ${sessionId} deleted (inactive for 1 hour)`);
    }
  });
}, 10000); // Check every 10 seconds

const PORT = process.env.PORT || 5500;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`MMO Server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
});
