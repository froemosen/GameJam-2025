# Game Session System Documentation

## Overview
The game now supports multiple isolated multiplayer sessions. Players can create their own game rooms or join existing ones using a session ID.

## Features
- **Beautiful Main Menu**: Gradient UI with session management
- **Create Sessions**: Generate unique 6-character session IDs
- **Join by ID**: Enter a session ID to join a specific game
- **Session List**: Browse all active sessions with live updates
- **Isolated Gameplay**: Players in different sessions don't interact
- **Auto-cleanup**: Empty sessions are automatically removed

## How to Use

### Creating a Session
1. Enter a session name in the "Create New Session" input
2. Click "Create Session"
3. Your session ID will be displayed with a copy button
4. Share the session ID with friends to invite them
5. Click "Start Game" to begin playing

### Joining a Session
**Option 1: Direct Join**
1. Enter a session ID in the "Join by Session ID" input
2. Click "Join Session"
3. The game will start automatically

**Option 2: Session List**
1. Browse the list of active sessions
2. Click "Join" on any session
3. The game will start automatically

### Session List Features
- Shows session name, ID, player count, and creation time
- Auto-refreshes every 3 seconds
- Displays "No active sessions" when empty
- Shows loading state while fetching

## Technical Details

### Architecture
```
Client (Browser)
  ├── MainMenu (src/mainMenu.js)
  │   ├── WebSocket connection for session list
  │   └── UI for create/join/list
  │
  ├── Game (src/game.js)
  │   └── Starts after session selection
  │
  └── MultiplayerClient (src/multiplayer.js)
      └── Connects with sessionId parameter

Server (Node.js)
  ├── GameSession class
  │   ├── id: Unique 6-character ID
  │   ├── name: Display name
  │   ├── creatorId: Player who created it
  │   ├── players: Set of player IDs
  │   └── Timestamps for creation/activity
  │
  └── WebSocket handlers
      ├── listSessions: Return all active sessions
      ├── createSession: Create new game room
      ├── joinSession: Add player to session
      ├── setUsername: Set player name
      ├── update: Sync player state (session-isolated)
      └── sound: Broadcast sounds (session-isolated)
```

### Session ID Format
- **Length**: 6 characters
- **Characters**: Alphanumeric (A-Z, 0-9)
- **Excluded**: Confusing characters (0, O, I, 1) for clarity
- **Example**: `A7K3M9`

### Session Lifecycle
1. **Creation**: Player creates session → Server generates ID → Session stored
2. **Joining**: Player joins → Added to session.players → Receives existing players
3. **Gameplay**: All updates/sounds isolated to session
4. **Cleanup**: Last player leaves → Session deleted after 1 hour of inactivity

### Broadcast Isolation
```javascript
// Old: All players receive message
broadcast(ws, data);

// New: Only session members receive message
broadcast(ws, data, sessionId);
```

### Files Modified
- `src/mainMenu.js` - NEW FILE: Complete main menu UI and logic
- `src/game.js` - Added MainMenu import and startGameWithSession()
- `src/multiplayer.js` - Added sessionId parameter and join logic
- `server.js` - Added GameSession class, session-based broadcasts, cleanup

## UI Design
- **Color Scheme**: Purple/pink gradient with glassmorphism
- **Typography**: Clean sans-serif with proper hierarchy
- **Layout**: Centered, responsive design
- **Interactions**: Hover effects, smooth transitions
- **Feedback**: Loading states, copy confirmations

## Server Configuration
- **Port**: 5500 (configurable via PORT env variable)
- **Timeout**: 30 seconds player inactivity
- **Cleanup**: Every 10 seconds
- **Session Expiry**: 1 hour after last activity

## Testing
1. Start server: `node server.js`
2. Open game in multiple browser windows
3. Create a session in window 1
4. Copy the session ID
5. Join with same ID in window 2
6. Verify players only see each other in same session

## Future Enhancements
- Session passwords for private games
- Maximum player limits per session
- Session settings (game mode, difficulty)
- Persistent sessions (save/restore)
- Session chat/voice communication
