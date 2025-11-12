// Main menu system for multiplayer game sessions
export class MainMenu {
  constructor(onStartGame) {
    this.onStartGame = onStartGame;
    this.menuElement = null;
    this.ws = null;
    this.availableSessions = [];
    this.isCreatingSession = false;
    this.isJoiningSession = false;
    
    this.createMenuUI();
    this.connectToServer();
  }
  
  createMenuUI() {
    // Create main menu overlay
    const menuHTML = `
      <div id="main-menu" class="main-menu">
        <div class="menu-container">
          <div class="menu-header">
            <h1 class="game-title">🎮 Mohamed's Multiplayer Adventure</h1>
            <p class="game-subtitle">Explore, Dance, and Play Together!</p>
          </div>
          
          <div class="menu-content">
            <div class="menu-section">
              <h2>Your Username</h2>
              <div class="username-form">
                <input 
                  type="text" 
                  id="username-input" 
                  class="menu-input" 
                  placeholder="Enter your username..."
                  maxlength="20"
                  value=""
                />
              </div>
            </div>
            
            <div class="menu-section">
              <h2>Create New Session</h2>
              <div class="session-create-form">
                <input 
                  type="text" 
                  id="session-name-input" 
                  class="menu-input" 
                  placeholder="Enter session name..."
                  maxlength="30"
                />
                <button id="create-session-btn" class="menu-button primary">
                  ✨ Create Session
                </button>
              </div>
            </div>
            
            <div class="menu-divider">
              <span>OR</span>
            </div>
            
            <div class="menu-section">
              <h2>Join Session</h2>
              <div class="session-join-form">
                <input 
                  type="text" 
                  id="session-id-input" 
                  class="menu-input" 
                  placeholder="Enter session ID..."
                  maxlength="20"
                />
                <button id="join-by-id-btn" class="menu-button secondary">
                  🔗 Join by ID
                </button>
              </div>
            </div>
            
            <div class="menu-section">
              <h2>Available Sessions</h2>
              <div id="session-list" class="session-list">
                <div class="session-list-loading">Loading sessions...</div>
              </div>
            </div>
          </div>
          
          <div class="menu-footer">
            <p>Controls: WASD/Arrows to move • Shift to run • Space to jump • F-L for animations</p>
          </div>
        </div>
      </div>
    `;
    
    // Add menu to DOM
    document.body.insertAdjacentHTML('beforeend', menuHTML);
    this.menuElement = document.getElementById('main-menu');
    
    // Load saved username if exists
    const savedUsername = localStorage.getItem('gameUsername');
    if (savedUsername) {
      const usernameInput = document.getElementById('username-input');
      if (usernameInput) {
        usernameInput.value = savedUsername;
      }
    }
    
    // Add event listeners
    this.setupEventListeners();
    
    // Add styles
    this.injectStyles();
  }
  
  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .main-menu {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        animation: menuFadeIn 0.5s ease-out;
      }
      
      @keyframes menuFadeIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      
      .menu-container {
        background: rgba(255, 255, 255, 0.95);
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 600px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        padding: 40px;
        backdrop-filter: blur(10px);
      }
      
      .menu-header {
        text-align: center;
        margin-bottom: 40px;
      }
      
      .game-title {
        font-size: 2.5em;
        font-weight: 800;
        margin: 0 0 10px 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      
      .game-subtitle {
        font-size: 1.1em;
        color: #666;
        margin: 0;
      }
      
      .menu-content {
        display: flex;
        flex-direction: column;
        gap: 30px;
      }
      
      .menu-section h2 {
        font-size: 1.3em;
        font-weight: 600;
        color: #333;
        margin: 0 0 15px 0;
      }
      
      .session-create-form,
      .session-join-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .menu-input {
        padding: 12px 16px;
        border: 2px solid #e0e0e0;
        border-radius: 12px;
        font-size: 1em;
        transition: all 0.3s ease;
        outline: none;
      }
      
      .menu-input:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }
      
      .menu-button {
        padding: 14px 24px;
        border: none;
        border-radius: 12px;
        font-size: 1em;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        outline: none;
      }
      
      .menu-button.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .menu-button.primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
      }
      
      .menu-button.secondary {
        background: #f0f0f0;
        color: #333;
      }
      
      .menu-button.secondary:hover {
        background: #e0e0e0;
        transform: translateY(-2px);
      }
      
      .menu-button:active {
        transform: translateY(0);
      }
      
      .menu-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none !important;
      }
      
      .menu-divider {
        display: flex;
        align-items: center;
        text-align: center;
        color: #999;
        font-weight: 500;
        margin: 10px 0;
      }
      
      .menu-divider::before,
      .menu-divider::after {
        content: '';
        flex: 1;
        border-bottom: 2px solid #e0e0e0;
      }
      
      .menu-divider span {
        padding: 0 15px;
      }
      
      .session-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 300px;
        overflow-y: auto;
      }
      
      .session-list-loading,
      .session-list-empty {
        text-align: center;
        padding: 40px 20px;
        color: #999;
        font-style: italic;
      }
      
      .session-item {
        background: #f8f8f8;
        padding: 16px;
        border-radius: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: all 0.3s ease;
        border: 2px solid transparent;
      }
      
      .session-item:hover {
        background: #f0f0f0;
        border-color: #667eea;
        transform: translateX(5px);
      }
      
      .session-info {
        flex: 1;
      }
      
      .session-name {
        font-weight: 600;
        font-size: 1.1em;
        color: #333;
        margin-bottom: 5px;
      }
      
      .session-details {
        font-size: 0.9em;
        color: #666;
      }
      
      .session-id {
        font-family: monospace;
        background: rgba(102, 126, 234, 0.1);
        padding: 2px 8px;
        border-radius: 6px;
        margin-right: 10px;
      }
      
      .session-players {
        color: #764ba2;
        font-weight: 500;
      }
      
      .session-join-btn {
        padding: 10px 20px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .session-join-btn:hover {
        background: #764ba2;
        transform: scale(1.05);
      }
      
      .menu-footer {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 2px solid #e0e0e0;
        text-align: center;
        color: #666;
        font-size: 0.9em;
      }
      
      .session-created-info {
        background: rgba(102, 126, 234, 0.1);
        padding: 20px;
        border-radius: 12px;
        margin-bottom: 20px;
        border: 2px solid #667eea;
      }
      
      .session-created-info h3 {
        margin: 0 0 10px 0;
        color: #667eea;
      }
      
      .session-id-display {
        font-size: 1.5em;
        font-weight: 700;
        font-family: monospace;
        color: #764ba2;
        margin: 10px 0;
        letter-spacing: 2px;
      }
      
      .copy-id-btn {
        padding: 8px 16px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 0.9em;
        cursor: pointer;
        margin-top: 10px;
      }
      
      .copy-id-btn:hover {
        background: #764ba2;
      }
      
      @media (max-width: 768px) {
        .menu-container {
          padding: 20px;
          width: 95%;
        }
        
        .game-title {
          font-size: 1.8em;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  setupEventListeners() {
    // Create session button
    const createBtn = document.getElementById('create-session-btn');
    createBtn.addEventListener('click', () => this.createSession());
    
    // Join by ID button
    const joinBtn = document.getElementById('join-by-id-btn');
    joinBtn.addEventListener('click', () => this.joinSessionById());
    
    // Enter key on inputs
    document.getElementById('session-name-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.createSession();
    });
    
    document.getElementById('session-id-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.joinSessionById();
    });
  }
  
  connectToServer() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('Menu connected to server');
      this.requestSessionList();
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleServerMessage(data);
      } catch (error) {
        console.error('Error parsing menu message:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('Menu WebSocket error:', error);
    };
    
    this.ws.onclose = (event) => {
      // Only log if it's an unexpected disconnection
      if (event.code !== 1000 && event.code !== 1001) {
        console.log('Menu disconnected from server (code:', event.code, ')');
      }
    };
  }
  
  handleServerMessage(data) {
    switch (data.type) {
      case 'updateSessionList':
        this.updateSessionList(data.sessions);
        break;
      case 'sessionCreated':
        this.resetLoadingStates();
        this.showSessionCreated(data.sessionId, data.sessionName);
        break;
      case 'sessionJoined':
        this.resetLoadingStates();
        this.startGame(data.sessionId);
        break;
      case 'error':
        this.resetLoadingStates();
        alert('Error: ' + data.message);
        break;
    }
  }
  
  requestSessionList() {
    this.sendWSMessage({ type: 'listSessions' });
  }
  
  createSession() {
    if (this.isCreatingSession) return;
    
    const usernameInput = document.getElementById('username-input');
    const username = usernameInput.value.trim();
    
    if (!username) {
      alert('Please enter a username first!');
      usernameInput.focus();
      return;
    }
    
    const nameInput = document.getElementById('session-name-input');
    const sessionName = nameInput.value.trim();
    
    if (!sessionName) {
      alert('Please enter a session name!');
      nameInput.focus();
      return;
    }
    
    // Set loading state
    this.isCreatingSession = true;
    const createBtn = document.getElementById('create-session-btn');
    const originalText = createBtn.innerHTML;
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="spinner"></span> Creating...';
    
    this.sendWSMessage({
      type: 'createSession',
      sessionName: sessionName
    });
      
    nameInput.value = '';
    
    // Reset button after timeout if no response
    setTimeout(() => {
      if (this.isCreatingSession) {
        this.isCreatingSession = false;
        createBtn.disabled = false;
        createBtn.innerHTML = originalText;
      }
    }, 10000);
  }
  
  joinSessionById() {
    if (this.isJoiningSession) return;
    
    const usernameInput = document.getElementById('username-input');
    const username = usernameInput.value.trim();
    
    if (!username) {
      alert('Please enter a username first!');
      usernameInput.focus();
      return;
    }
    
    const idInput = document.getElementById('session-id-input');
    const sessionId = idInput.value.trim().toUpperCase();
    
    if (!sessionId) {
      alert('Please enter a session ID');
      return;
    }

    // Set loading state
    this.isJoiningSession = true;
    const joinBtn = document.getElementById('join-by-id-btn');
    const originalText = joinBtn.innerHTML;
    joinBtn.disabled = true;
    joinBtn.innerHTML = '<span class="spinner"></span> Joining...';

    this.sendWSMessage({
      type: 'joinSession',
      sessionId: sessionId
    });
      
    idInput.value = '';
    
    // Reset button after timeout if no response
    setTimeout(() => {
      if (this.isJoiningSession) {
        this.isJoiningSession = false;
        joinBtn.disabled = false;
        joinBtn.innerHTML = originalText;
      }
    }, 10000);
  }
  
  joinSession(sessionId) {
    if (this.isJoiningSession) return;
    
    const usernameInput = document.getElementById('username-input');
    const username = usernameInput.value.trim();
    
    if (!username) {
      alert('Please enter a username first!');
      usernameInput.focus();
      return;
    }

    // Set loading state
    this.isJoiningSession = true;

    this.sendWSMessage({    
      type: 'joinSession',
      sessionId: sessionId
    });
    
    // Reset state after timeout if no response
    setTimeout(() => {
      this.isJoiningSession = false;
    }, 10000);
  }
  
  updateSessionList(sessions) {
    const listElement = document.getElementById('session-list');
    
    if (!sessions || sessions.length === 0) {
      listElement.innerHTML = '<div class="session-list-empty">No active sessions. Create one to get started!</div>';
      return;
    }
    
    listElement.innerHTML = sessions.map(session => `
      <div class="session-item">
        <div class="session-info">
          <div class="session-name">${this.escapeHtml(session.name)}</div>
          <div class="session-details">
            <span class="session-id">${session.id}</span>
            <span class="session-players">👥 ${session.playerCount} player${session.playerCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button class="session-join-btn" onclick="window.mainMenu.joinSession('${session.id}')">
          Join
        </button>
      </div>
    `).join('');
  }
  
  showSessionCreated(sessionId, sessionName) {
    const content = document.querySelector('.menu-content');
    
    const infoHTML = `
      <div class="session-created-info">
        <h3>🎉 Session Created!</h3>
        <p><strong>${this.escapeHtml(sessionName)}</strong></p>
        <div>Session ID:</div>
        <div class="session-id-display">${sessionId}</div>
        <button class="copy-id-btn" onclick="navigator.clipboard.writeText('${sessionId}').then(() => alert('Session ID copied!'))">
          📋 Copy ID
        </button>
        <p style="margin-top: 15px; font-size: 0.9em; color: #666;">
          Share this ID with friends so they can join!
        </p>
        <button class="menu-button primary" onclick="window.mainMenu.startGame('${sessionId}')" style="margin-top: 15px; width: 100%;">
          Start Playing
        </button>
      </div>
    `;
    
    content.insertAdjacentHTML('afterbegin', infoHTML);
  }
  
  startGame(sessionId) {
    console.log('Starting game in session:', sessionId);
    
    // Close menu WebSocket (game will create its own)
    this.closeWS();
    
    // Get username from input
    const usernameInput = document.getElementById('username-input');
    const username = usernameInput ? usernameInput.value.trim() : '';
    
    // Hide menu with animation
    this.menuElement.style.animation = 'menuFadeIn 0.3s ease-out reverse';
    setTimeout(() => {
      this.menuElement.style.display = 'none';
      
      // Start the game with session ID and username
      this.onStartGame(sessionId, username);
    }, 300);
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  show() {
    if (this.menuElement) {
      this.menuElement.style.display = 'flex';
      this.connectToServer();
    }
  }
  
  hide() {
    if (this.menuElement) {
      this.menuElement.style.display = 'none';
    }
    
    if (this.sessionListUpdateInterval) {
      clearInterval(this.sessionListUpdateInterval);
    }
    
    this.closeWS();
  }

  closeWS() {
    if (this.ws) {
      this.ws.dispatchEvent(new CloseEvent('close', {code: 1000, reason: 'Menu closed'}));
      this.ws.close();
    }
  }

  resetLoadingStates() {
    // Reset create session button
    if (this.isCreatingSession) {
      this.isCreatingSession = false;
      const createBtn = document.getElementById('create-session-btn');
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.innerHTML = '✨ Create Session';
      }
    }
    
    // Reset join by ID button
    if (this.isJoiningSession) {
      this.isJoiningSession = false;
      const joinBtn = document.getElementById('join-by-id-btn');
      if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.innerHTML = '🔗 Join by ID';
      }
    }
  }

  sendWSMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

// Add spinner CSS if not already present
if (!document.getElementById('menu-spinner-styles')) {
  const style = document.createElement('style');
  style.id = 'menu-spinner-styles';
  style.textContent = `
    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      vertical-align: middle;
      margin-right: 5px;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .menu-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);
}
