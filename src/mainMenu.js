// Main menu system for multiplayer game sessions
export class MainMenu {
  constructor(onStartGame) {
    this.onStartGame = onStartGame;
    this.menuElement = null;
    this.ws = null;
    this.availableSessions = [];
    this.isCreatingSession = false;
    this.isJoiningSession = false;
    this.currentSessionId = null;
    this.currentSessionName = null;
    
    this.createMenuUI();
    this.connectToServer();
    this.checkAutoJoin();
  }
  
  checkAutoJoin() {
    // Check if there's a join parameter in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const joinId = urlParams.get('join');
    if (joinId) {
      this.pendingJoinId = joinId.toUpperCase();
      // Show modal after a short delay to ensure DOM is ready
      setTimeout(() => this.showJoinModal(this.pendingJoinId), 200);
    }
  }
  
  showJoinModal(sessionId) {
    const modal = document.getElementById('join-modal');
    const modalSessionId = document.getElementById('modal-session-id');
    const modalUsernameInput = document.getElementById('modal-username-input');
    
    if (!modal) return;
    
    modalSessionId.textContent = sessionId;
    
    // Pre-fill username from localStorage if available
    const savedUsername = localStorage.getItem('gameUsername');
    if (savedUsername && modalUsernameInput) {
      modalUsernameInput.value = savedUsername;
    }
    
    modal.classList.add('show');
    
    // Focus on username input
    setTimeout(() => {
      if (modalUsernameInput) {
        modalUsernameInput.focus();
        // If username is pre-filled, select it so user can easily change it
        if (savedUsername) {
          modalUsernameInput.select();
        }
      }
    }, 300);
  }
  
  hideJoinModal() {
    const modal = document.getElementById('join-modal');
    if (modal) {
      modal.classList.remove('show');
    }
  }
  
  handleModalJoin() {
    const usernameInput = document.getElementById('modal-username-input');
    const username = usernameInput?.value.trim();
    const errorElem = document.getElementById('modal-username-error');
    
    if (!username) {
      if (errorElem) {
        errorElem.textContent = 'Please enter a username';
      }
      usernameInput?.focus();
      return;
    }
    
    if (!this.pendingJoinId) return;
    
    // Set username in main form
    const mainUsernameInput = document.getElementById('username-input');
    if (mainUsernameInput) {
      mainUsernameInput.value = username;
      localStorage.setItem('gameUsername', username);
    }
    
    // Join the session
    this.isJoiningSession = true;
    this.sendWSMessage({
      type: 'joinSession',
      sessionId: this.pendingJoinId,
      username: username
    });

    // Hide modal
    this.hideJoinModal();
    
    // Reset state after timeout if no response
    setTimeout(() => {
      this.isJoiningSession = false;
    }, 10000);
  }
  
  createMenuUI() {
    // Create main menu overlay
    const menuHTML = `
      <div id="main-menu" class="main-menu">
        <!-- Join Modal -->
        <div id="join-modal" class="join-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2>🎮 Join Game Session</h2>
              <button class="modal-close" id="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <p class="modal-description">You're about to join session: <strong id="modal-session-id"></strong></p>
              <div class="modal-input-group">
                <label for="modal-username-input">Enter your username:</label>
                <input 
                  type="text" 
                  id="modal-username-input" 
                  class="modal-input" 
                  placeholder="Your username..."
                  maxlength="20"
                />
                <div class="input-error" id="modal-username-error"></div>
              </div>
            </div>
            <div class="modal-footer">
              <button id="modal-join-btn" class="modal-button primary">Join Session</button>
              <button id="modal-cancel-btn" class="modal-button secondary">Cancel</button>
            </div>
          </div>
        </div>
        
        <!-- Session Sidebar (desktop only) -->
        <div class="session-sidebar" id="session-sidebar">
          <div class="sidebar-header">
            <h3>🎮 Active Sessions</h3>
            <div class="sidebar-refresh" id="refresh-sessions" title="Refresh">🔄</div>
          </div>
          <div id="sidebar-session-list" class="sidebar-session-list">
            <div class="sidebar-loading">Loading...</div>
          </div>
        </div>
        
        <div class="menu-container">
          <div class="menu-header">
            <div class="controller-icon">
              <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 10 Q5 10 5 20 L5 40 Q5 50 15 50 L35 50 Q40 50 42 45 L50 25 L58 45 Q60 50 65 50 L85 50 Q95 50 95 40 L95 20 Q95 10 85 10 Z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="2"/>
                <circle cx="25" cy="25" r="3" fill="currentColor"/>
                <circle cx="25" cy="35" r="3" fill="currentColor"/>
                <circle cx="20" cy="30" r="3" fill="currentColor"/>
                <circle cx="30" cy="30" r="3" fill="currentColor"/>
                <circle cx="70" cy="30" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
                <circle cx="80" cy="30" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
                <rect x="45" y="18" width="10" height="3" rx="1.5" fill="currentColor"/>
                <rect x="45" y="25" width="10" height="3" rx="1.5" fill="currentColor"/>
              </svg>
            </div>
            <h1 class="game-title">Mohamed's Multiplayer Adventure</h1>
            <p class="game-subtitle">Explore, Dance, and Play Together!</p>
          </div>
          
          <div id="error-message" class="error-message"></div>
          <div id="success-message" class="success-message"></div>
          
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
                <div class="input-error" id="username-error"></div>
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
                <div class="input-error" id="session-name-error"></div>
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
                <div class="input-error" id="session-id-error"></div>
                <button id="join-by-id-btn" class="menu-button secondary">
                  🔗 Join by ID
                </button>
              </div>
            </div>
            
            <div class="menu-section mobile-session-list">
              <h2>Available Sessions</h2>
              <div id="mobile-session-list" class="session-list">
                <div class="session-list-loading">Loading sessions...</div>
              </div>
            </div>
          </div>
          
          <div class="menu-footer">
            <div class="controls-grid">
              <div class="control-item">
                <span class="control-key">WASD / ←↑↓→</span>
                <span class="control-desc">Move</span>
              </div>
              <div class="control-item">
                <span class="control-key">Shift</span>
                <span class="control-desc">Run</span>
              </div>
              <div class="control-item">
                <span class="control-key">Space</span>
                <span class="control-desc">Jump</span>
              </div>
              <div class="control-item">
                <span class="control-key">F-L</span>
                <span class="control-desc">Animations</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add menu to DOM
    document.body.insertAdjacentHTML('beforeend', menuHTML);
    this.menuElement = document.getElementById('main-menu');
    
    // Disable pointer events on game elements when menu is shown
    this.disableGameElements();
    
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
    
    // Load QR Code library
    this.loadQRCodeLibrary();
  }
  
  loadQRCodeLibrary() {
    if (!window.QRCode) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
      script.onload = () => {
        console.log('QR Code library loaded');
      };
      document.head.appendChild(script);
    }
  }
  
  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .main-menu {
        position: relative;
        min-height: 100vh;
        min-height: -webkit-fill-available;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        gap: 20px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        animation: menuFadeIn 0.5s ease-out;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
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
      
      .session-sidebar {
        background: rgba(255, 255, 255, 0.95);
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        width: 320px;
        max-height: calc(100vh - 40px);
        overflow-y: auto;
        padding: 24px;
        backdrop-filter: blur(10px);
        display: flex;
        flex-direction: column;
      }
      
      .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 2px solid #e0e0e0;
      }
      
      .sidebar-header h3 {
        margin: 0;
        font-size: 1.2em;
        color: #333;
      }
      
      .sidebar-refresh {
        cursor: pointer;
        font-size: 1.3em;
        transition: transform 0.3s ease;
        padding: 5px;
      }
      
      .sidebar-refresh:hover {
        transform: rotate(90deg);
      }
      
      .sidebar-session-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1;
      }
      
      .sidebar-loading,
      .sidebar-empty {
        text-align: center;
        padding: 40px 20px;
        color: #999;
        font-style: italic;
      }
      
      .sidebar-session-item {
        background: #f8f8f8;
        padding: 14px;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.3s ease;
        border: 2px solid transparent;
      }
      
      .sidebar-session-item:hover {
        background: #f0f0f0;
        border-color: #667eea;
        transform: translateX(5px);
      }
      
      .sidebar-session-name {
        font-weight: 600;
        color: #333;
        margin-bottom: 6px;
        font-size: 1em;
      }
      
      .sidebar-session-id {
        font-family: monospace;
        font-size: 0.85em;
        color: #666;
        background: rgba(102, 126, 234, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        display: inline-block;
        margin-bottom: 4px;
      }
      
      .sidebar-session-players {
        font-size: 0.9em;
        color: #764ba2;
        font-weight: 500;
      }
      
      .menu-container {
        background: rgba(255, 255, 255, 0.95);
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        width: 100%;
        max-width: 600px;
        max-height: calc(100vh - 40px);
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 40px;
        backdrop-filter: blur(10px);
        touch-action: pan-y;
      }
      
      .menu-header {
        text-align: center;
        margin-bottom: 30px;
      }
      
      .controller-icon {
        width: 80px;
        height: 50px;
        margin: 0 auto 15px;
        color: #667eea;
      }
      
      .controller-icon svg {
        width: 100%;
        height: 100%;
      }
      
      .game-title {
        font-size: 2.2em;
        font-weight: 800;
        margin: 0 0 10px 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      
      .game-subtitle {
        font-size: 1em;
        color: #666;
        margin: 0;
      }
      
      .error-message,
      .success-message {
        padding: 12px 16px;
        border-radius: 12px;
        margin-bottom: 20px;
        font-size: 0.95em;
        display: none;
        animation: slideDown 0.3s ease-out;
      }
      
      .error-message {
        background: #fee;
        border: 2px solid #fcc;
        color: #c33;
      }
      
      .success-message {
        background: #efe;
        border: 2px solid #cfc;
        color: #3c3;
      }
      
      .error-message.show,
      .success-message.show {
        display: block;
      }
      
      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .input-error {
        color: #c33;
        font-size: 0.85em;
        margin-top: 5px;
        min-height: 18px;
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
        touch-action: manipulation;
        -webkit-tap-highlight-color: rgba(102, 126, 234, 0.2);
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
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
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
      }
      
      .controls-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
      
      .control-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
      }
      
      .control-key {
        background: #f0f0f0;
        padding: 6px 12px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.85em;
        color: #667eea;
        border: 2px solid #e0e0e0;
      }
      
      .control-desc {
        font-size: 0.8em;
        color: #666;
      }
      
      .session-created-info {
        background: rgba(102, 126, 234, 0.05);
        padding: 24px;
        border-radius: 16px;
        margin-bottom: 20px;
        border: 2px solid #667eea;
      }
      
      .session-created-info h3 {
        margin: 0 0 15px 0;
        color: #667eea;
        font-size: 1.5em;
        text-align: center;
      }
      
      .session-created-details {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
      }
      
      .session-qr-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      
      .session-qr-code {
        background: white;
        padding: 10px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
      
      .session-qr-code canvas {
        display: block;
        border-radius: 8px;
      }
      
      .session-info-container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 12px;
      }
      
      .session-id-display {
        font-size: 1.3em;
        font-weight: 700;
        font-family: monospace;
        color: #764ba2;
        letter-spacing: 2px;
        padding: 10px;
        background: white;
        border-radius: 8px;
        text-align: center;
      }
      
      .session-name-display {
        font-size: 1.1em;
        font-weight: 600;
        color: #333;
        text-align: center;
      }
      
      .copy-id-btn {
        padding: 8px 16px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 0.9em;
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .copy-id-btn:hover {
        background: #764ba2;
        transform: translateY(-2px);
      }
      
      .players-section {
        background: white;
        padding: 15px;
        border-radius: 12px;
        margin-bottom: 15px;
      }
      
      .players-section h4 {
        margin: 0 0 10px 0;
        color: #667eea;
        font-size: 1.1em;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .player-count-badge {
        background: #667eea;
        color: white;
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 0.85em;
        font-weight: 600;
      }
      
      .players-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .player-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: #f8f8f8;
        border-radius: 8px;
        font-size: 0.95em;
      }
      
      .player-avatar {
        width: 30px;
        height: 30px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 0.9em;
      }
      
      .player-name {
        flex: 1;
        color: #333;
        font-weight: 500;
      }
      
      .player-status {
        font-size: 0.8em;
        color: #999;
      }
      
      .no-players {
        text-align: center;
        padding: 20px;
        color: #999;
        font-style: italic;
      }
      
      /* Idling Lobby Styles */
      .idling-lobby {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      
      .lobby-header {
        text-align: center;
        padding-bottom: 20px;
        border-bottom: 2px solid #e0e0e0;
        margin-bottom: 20px;
      }
      
      .lobby-header h2 {
        margin: 0 0 10px 0;
        font-size: 1.8em;
        color: #333;
      }
      
      .lobby-session-info {
        font-size: 0.9em;
        color: #666;
      }
      
      .lobby-label {
        font-weight: 600;
        margin-right: 8px;
      }
      
      .lobby-session-id {
        font-family: monospace;
        background: rgba(102, 126, 234, 0.1);
        padding: 4px 12px;
        border-radius: 6px;
        color: #667eea;
        font-weight: 600;
      }
      
      .lobby-content {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 20px;
      }
      
      .lobby-share-section {
        background: #f8f8f8;
        padding: 20px;
        border-radius: 12px;
        margin-bottom: 20px;
      }
      
      .lobby-share-section h3 {
        margin: 0 0 15px 0;
        font-size: 1.1em;
        color: #333;
      }
      
      .lobby-share-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 20px;
        align-items: center;
      }
      
      .lobby-qr-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      
      .lobby-qr-wrapper small {
        color: #666;
        font-size: 0.85em;
      }
      
      .lobby-share-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      
      .lobby-copy-btn {
        width: 100%;
      }
      
      .lobby-hint {
        margin: 0;
        font-size: 0.9em;
        color: #666;
      }
      
      .lobby-players-section {
        background: white;
        padding: 20px;
        border-radius: 12px;
        border: 2px solid #e0e0e0;
      }
      
      .lobby-players-section h3 {
        margin: 0 0 15px 0;
        font-size: 1.1em;
        color: #333;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .lobby-footer {
        border-top: 2px solid #e0e0e0;
        padding-top: 20px;
      }
      
      .lobby-footer-hint {
        text-align: center;
        color: #666;
        font-size: 0.85em;
        margin: 10px 0 15px 0;
      }
      
      .waiting-message {
        text-align: center;
        padding: 20px;
        background: #f8f8f8;
        border-radius: 12px;
        margin-bottom: 15px;
      }
      
      .waiting-message p {
        margin: 10px 0 0 0;
        color: #666;
        font-size: 0.95em;
      }
      
      .waiting-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #e0e0e0;
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto;
      }
      
      .lobby-leave-btn {
        width: 100%;
      }
      
      .mobile-session-list {
        display: none;
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
      
      /* Join Modal Styles */
      .join-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        padding: 20px;
        animation: fadeIn 0.3s ease-out;
        pointer-events: none;
      }
      
      .join-modal.show {
        display: flex;
        pointer-events: auto;
      }
      
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      
      .modal-content {
        background: white;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        max-width: 500px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        animation: slideUp 0.3s ease-out;
      }
      
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .modal-header {
        padding: 24px;
        border-bottom: 2px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .modal-header h2 {
        margin: 0;
        font-size: 1.5em;
        color: #333;
      }
      
      .modal-close {
        background: none;
        border: none;
        font-size: 2em;
        color: #999;
        cursor: pointer;
        padding: 0;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.3s ease;
      }
      
      .modal-close:hover {
        background: #f0f0f0;
        color: #333;
      }
      
      .modal-body {
        padding: 24px;
      }
      
      .modal-description {
        margin: 0 0 20px 0;
        color: #666;
        font-size: 1em;
        line-height: 1.5;
      }
      
      .modal-description strong {
        color: #667eea;
        font-family: monospace;
        font-size: 1.1em;
      }
      
      .modal-input-group {
        margin-bottom: 15px;
      }
      
      .modal-input-group label {
        display: block;
        margin-bottom: 8px;
        color: #333;
        font-weight: 600;
        font-size: 0.95em;
      }
      
      .modal-input {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #e0e0e0;
        border-radius: 12px;
        font-size: 1em;
        transition: all 0.3s ease;
        outline: none;
        box-sizing: border-box;
        touch-action: manipulation;
        -webkit-tap-highlight-color: rgba(102, 126, 234, 0.2);
      }
      
      .modal-input:focus {
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }
      
      .modal-footer {
        padding: 20px 24px;
        border-top: 2px solid #e0e0e0;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }
      
      .modal-button {
        padding: 12px 24px;
        border: none;
        border-radius: 12px;
        font-size: 1em;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        outline: none;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      
      .modal-button.primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        flex: 1;
      }
      
      .modal-button.primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
      }
      
      .modal-button.secondary {
        background: #f0f0f0;
        color: #666;
      }
      
      .modal-button.secondary:hover {
        background: #e0e0e0;
      }
      
      @media (max-width: 1024px) {
        .session-sidebar {
          display: none;
        }
        
        .mobile-session-list {
          display: block;
        }
        
        .main-menu {
          padding: 10px;
        }
      }
      
      @media (max-width: 768px) {
        .main-menu {
          padding: 10px;
          align-items: flex-start;
          min-height: 100vh;
          min-height: -webkit-fill-available;
        }
        
        .menu-container {
          padding: 20px;
          max-height: calc(100vh - 20px);
          max-height: calc(-webkit-fill-available - 20px);
          margin-top: auto;
          margin-bottom: auto;
        }
        
        .game-title {
          font-size: 1.6em;
        }
        
        .game-subtitle {
          font-size: 0.9em;
        }
        
        .controller-icon {
          width: 60px;
          height: 40px;
        }
        
        .session-created-details {
          grid-template-columns: 1fr;
        }
        
        .controls-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        
        .control-key {
          font-size: 0.75em;
          padding: 4px 8px;
        }
        
        .control-desc {
          font-size: 0.75em;
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
    
    // Refresh sessions button
    const refreshBtn = document.getElementById('refresh-sessions');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.requestSessionList());
    }
    
    // Modal buttons
    const modalJoinBtn = document.getElementById('modal-join-btn');
    if (modalJoinBtn) {
      modalJoinBtn.addEventListener('click', () => this.handleModalJoin());
    }
    
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', () => this.hideJoinModal());
    }
    
    const modalClose = document.getElementById('modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => this.hideJoinModal());
    }
    
    // Modal username input enter key
    const modalUsernameInput = document.getElementById('modal-username-input');
    if (modalUsernameInput) {
      modalUsernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleModalJoin();
      });
      modalUsernameInput.addEventListener('input', () => {
        const errorElem = document.getElementById('modal-username-error');
        if (errorElem) errorElem.textContent = '';
      });
    }
    
    // Enter key on inputs
    document.getElementById('session-name-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.createSession();
    });
    
    document.getElementById('session-id-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.joinSessionById();
    });
    
    // Clear input errors on typing
    document.getElementById('username-input').addEventListener('input', () => {
      this.clearInputError('username-error');
      this.hideMessage('error');
    });
    
    document.getElementById('session-name-input').addEventListener('input', () => {
      this.clearInputError('session-name-error');
      this.hideMessage('error');
    });
    
    document.getElementById('session-id-input').addEventListener('input', () => {
      this.clearInputError('session-id-error');
      this.hideMessage('error');
    });
  }
  
  showError(message, inputId = null) {
    const errorMsg = document.getElementById('error-message');
    errorMsg.textContent = message;
    errorMsg.classList.add('show');
    
    if (inputId) {
      const inputError = document.getElementById(inputId);
      if (inputError) {
        inputError.textContent = message;
      }
    }
    
    setTimeout(() => this.hideMessage('error'), 5000);
  }
  
  showSuccess(message) {
    const successMsg = document.getElementById('success-message');
    successMsg.textContent = message;
    successMsg.classList.add('show');
    
    setTimeout(() => this.hideMessage('success'), 3000);
  }
  
  hideMessage(type) {
    const msg = document.getElementById(`${type}-message`);
    if (msg) {
      msg.classList.remove('show');
    }
  }
  
  clearInputError(errorId) {
    const errorElem = document.getElementById(errorId);
    if (errorElem) {
      errorElem.textContent = '';
    }
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
      case 'sessionJoined':
        this.resetLoadingStates();
        
        // Store the player ID and session players for when we transition to game
        this.playerId = data.playerId;
        this.sessionPlayers = data.players || [];
        console.log('Menu stored player ID:', this.playerId, 'and', this.sessionPlayers.length, 'players', 'started:', data.started);
        
        // If session is already started, go straight to game
        if (data.started) {
          console.log('Session already started, joining game directly');
          this.startGame(data.sessionId);
          break;
        }
        
        // Determine username for lobby display
        let creatorUsername = null;
        
        // Check if we have a pending username (creator just created session)
        if (this.pendingUsername) {
          creatorUsername = this.pendingUsername;
          this.pendingUsername = null; // Clear it
        } else if (data.players && data.players.length > 0) {
          // Try to find creator from players list
          const creator = data.players.find(p => p.id === data.sessionId);
          if (creator) {
            creatorUsername = creator.username;
          }
        }
        
        // Show the idling lobby with existing players
        this.showIdlingLobby(data.sessionId, creatorUsername, data.players || []);
        break;
      case 'sessionStarted':
        // Game has started - transition from lobby to game
        this.startGame(data.sessionId);
        break;
      case 'playerJoined':
        // Handle when a player joins any session (for live updates in idling lobby)
        if (this.currentSessionId && data.player) {
          this.addPlayerToSession(data.player);
          // Keep our session players list in sync
          if (this.sessionPlayers && !this.sessionPlayers.find(p => p.id === data.player.id)) {
            this.sessionPlayers.push(data.player);
            console.log('Added player to session list, now', this.sessionPlayers.length, 'players');
          }
        }
        break;
      case 'playerLeft':
        // Handle when a player leaves any session
        if (this.currentSessionId && data.id) {
          this.removePlayerFromSession(data.id);
          // Keep our session players list in sync
          if (this.sessionPlayers) {
            this.sessionPlayers = this.sessionPlayers.filter(p => p.id !== data.id);
            console.log('Removed player from session list, now', this.sessionPlayers.length, 'players');
          }
        }
        break;
      case 'error':
        this.resetLoadingStates();
        this.showError(data.message);
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
      this.showError('Please enter a username first!', 'username-error');
      usernameInput.focus();
      return;
    }
    
    const nameInput = document.getElementById('session-name-input');
    const sessionName = nameInput.value.trim();
    
    if (!sessionName) {
      this.showError('Please enter a session name!', 'session-name-error');
      nameInput.focus();
      return;
    }
    
    // Set loading state
    this.isCreatingSession = true;
    const createBtn = document.getElementById('create-session-btn');
    const originalText = createBtn.innerHTML;
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="spinner"></span> Creating...';
    
    // Save username
    localStorage.setItem('gameUsername', username);
    this.pendingUsername = username; // Store for when sessionJoined arrives
    
    this.sendWSMessage({
      type: 'createSession',
      sessionName: sessionName,
      username: username
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
      this.showError('Please enter a username first!', 'username-error');
      usernameInput.focus();
      return;
    }
    
    const idInput = document.getElementById('session-id-input');
    const sessionId = idInput.value.trim().toUpperCase();
    
    if (!sessionId) {
      this.showError('Please enter a session ID', 'session-id-error');
      idInput.focus();
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
      this.showError('Please enter a username first!', 'username-error');
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
    // Update sidebar session list (desktop)
    const sidebarList = document.getElementById('sidebar-session-list');
    if (sidebarList) {
      if (!sessions || sessions.length === 0) {
        sidebarList.innerHTML = '<div class="sidebar-empty">No active sessions</div>';
      } else {
        sidebarList.innerHTML = sessions.map(session => `
          <div class="sidebar-session-item" onclick="window.mainMenu.joinSession('${session.id}')">
            <div class="sidebar-session-name">${this.escapeHtml(session.name)}</div>
            <div class="sidebar-session-id">${session.id}</div>
            <div class="sidebar-session-players">👥 ${session.playerCount} player${session.playerCount !== 1 ? 's' : ''}</div>
          </div>
        `).join('');
      }
    }
    
    // Update mobile session list
    const mobileList = document.getElementById('mobile-session-list');
    if (mobileList) {
      if (!sessions || sessions.length === 0) {
        mobileList.innerHTML = '<div class="session-list-empty">No active sessions. Create one to get started!</div>';
      } else {
        mobileList.innerHTML = sessions.map(session => `
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
    }
  }
  
  showIdlingLobby(sessionId, creatorUsername, existingPlayers = []) {
    this.currentSessionId = sessionId;
    this.isCreator = !!creatorUsername;
    
    const content = document.querySelector('.menu-content');
    const sidebar = document.querySelector('.session-sidebar');
    
    // Hide main menu elements
    if (content) content.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    
    // Build the join URL
    const joinUrl = `${window.location.origin}${window.location.pathname}?join=${sessionId}`;
    
    // Create or get lobby container
    let lobbyContainer = document.getElementById('idling-lobby');
    if (!lobbyContainer) {
      lobbyContainer = document.createElement('div');
      lobbyContainer.id = 'idling-lobby';
      lobbyContainer.className = 'idling-lobby';
      document.querySelector('.menu-container').appendChild(lobbyContainer);
    }
    
    // Generate player list HTML
    let playersHTML = '';
    if (existingPlayers.length === 0) {
      playersHTML = '<div class="no-players">Waiting for players...</div>';
    } else {
      playersHTML = existingPlayers.map(player => {
        const initial = (player.username || 'U').charAt(0).toUpperCase();
        return `
          <div class="player-item" data-player-id="${player.id}">
            <div class="player-avatar">${initial}</div>
            <div class="player-name">${this.escapeHtml(player.username || 'Unknown')}</div>
            <div class="player-status">Ready</div>
          </div>
        `;
      }).join('');
    }
    
    const lobbyHTML = `
      <div class="lobby-header">
        <h2>🎮 Game Lobby</h2>
        <div class="lobby-session-info">
          <span class="lobby-label">Session ID:</span>
          <span class="lobby-session-id">${sessionId}</span>
        </div>
      </div>
      
      <div class="lobby-content">
        ${this.isCreator ? `
        <div class="lobby-share-section">
          <h3>📤 Share with Friends</h3>
          <div class="lobby-share-grid">
            <div class="lobby-qr-wrapper">
              <div class="session-qr-code" id="qr-${sessionId}"></div>
              <small>Scan to join</small>
            </div>
            <div class="lobby-share-actions">
              <button class="copy-id-btn lobby-copy-btn" onclick="window.mainMenu.copySessionId('${sessionId}')">
                📋 Copy Session ID
              </button>
              <p class="lobby-hint">Share the ID or QR code</p>
            </div>
          </div>
        </div>
        ` : `
        <div class="waiting-message">
          <div class="waiting-spinner"></div>
          <p>Waiting for the host to start the game...</p>
        </div>
        `}
        
        <div class="lobby-players-section">
          <h3>
            <span>👥 Players in Lobby</span>
            <span class="player-count-badge" id="lobby-player-count">${existingPlayers.length}</span>
          </h3>
          <div class="players-list" id="lobby-players-list">
            ${playersHTML}
          </div>
        </div>
      </div>
      
      <div class="lobby-footer">
        ${this.isCreator ? `
          <div class="lobby-footer-hint">When everyone is ready, start the game!</div>
          <button class="menu-button primary" id="start-game-btn" onclick="window.mainMenu.startIdlingSession()" style="width: 100%;">
            🚀 Start Game
          </button>
        ` : `
          <button class="menu-button secondary lobby-leave-btn" onclick="window.mainMenu.leaveLobby()" style="width: 100%;">
            ← Leave Lobby
          </button>
        `}
      </div>
    `;
    
    lobbyContainer.innerHTML = lobbyHTML;
    
    // Generate QR code after a short delay to ensure DOM is ready
    setTimeout(() => this.generateQRCode(sessionId, joinUrl), 100);
    
    // Subscribe to player updates for this session
    this.sendWSMessage({
      type: 'subscribeSession',
      sessionId: sessionId
    });
  }
  
  generateQRCode(sessionId, url) {
    const qrContainer = document.getElementById(`qr-${sessionId}`);
    if (qrContainer && window.QRCode) {
      qrContainer.innerHTML = ''; // Clear any existing content
      new QRCode(qrContainer, {
        text: url,
        width: 128,
        height: 128,
        colorDark: '#667eea',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else if (qrContainer) {
      // Fallback if QRCode library not loaded yet
      qrContainer.innerHTML = '<div style="width: 128px; height: 128px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #999; font-size: 0.8em; text-align: center; padding: 10px;">Loading QR...</div>';
      setTimeout(() => this.generateQRCode(sessionId, url), 500);
    }
  }
  
  copySessionId(sessionId) {
    navigator.clipboard.writeText(`${window.location.origin}?join=${sessionId}`).then(() => {
      this.showSuccess('Session ID copied to clipboard!');
    }).catch(() => {
      this.showError('Failed to copy session ID');
    });
  }
  
  updateSessionPlayers(sessionId, players) {
    const countBadge = document.getElementById(`player-count-${sessionId}`);
    const playersList = document.getElementById(`players-list-${sessionId}`);
    
    if (!countBadge || !playersList) return;
    
    countBadge.textContent = players.length;
    
    if (players.length === 0) {
      playersList.innerHTML = '<div class="no-players">Waiting for players to join...</div>';
    } else {
      playersList.innerHTML = players.map((player, index) => {
        const initial = player.username.charAt(0).toUpperCase();
        return `
          <div class="player-item" data-player-id="${player.id}">
            <div class="player-avatar">${initial}</div>
            <div class="player-name">${this.escapeHtml(player.username)}</div>
            <div class="player-status">Ready</div>
          </div>
        `;
      }).join('');
    }
  }
  
  addPlayerToSession(player) {
    if (!this.currentSessionId) return;
    
    // Try both lobby and session-specific IDs
    const countBadge = document.getElementById('lobby-player-count') || document.getElementById(`player-count-${this.currentSessionId}`);
    const playersList = document.getElementById('lobby-players-list') || document.getElementById(`players-list-${this.currentSessionId}`);
    
    if (!playersList) return;
    
    // Remove "no players" message if it exists
    const noPlayers = playersList.querySelector('.no-players');
    if (noPlayers) {
      noPlayers.remove();
    }
    
    // Check if player already exists (shouldn't happen, but just in case)
    const existingPlayer = playersList.querySelector(`[data-player-id="${player.id}"]`);
    if (existingPlayer) return;
    
    // Add the new player
    const initial = (player.username || 'U').charAt(0).toUpperCase();
    const playerHTML = `
      <div class="player-item" data-player-id="${player.id}">
        <div class="player-avatar">${initial}</div>
        <div class="player-name">${this.escapeHtml(player.username || 'Unknown')}</div>
        <div class="player-status">Ready</div>
      </div>
    `;
    playersList.insertAdjacentHTML('beforeend', playerHTML);
    
    // Update count
    if (countBadge) {
      const currentCount = parseInt(countBadge.textContent) || 0;
      countBadge.textContent = currentCount + 1;
    }
    
    // Show a subtle success message
    this.showSuccess(`${player.username} joined the session!`);
  }
  
  removePlayerFromSession(playerId) {
    if (!this.currentSessionId) return;
    
    // Try both lobby and session-specific IDs
    const countBadge = document.getElementById('lobby-player-count') || document.getElementById(`player-count-${this.currentSessionId}`);
    const playersList = document.getElementById('lobby-players-list') || document.getElementById(`players-list-${this.currentSessionId}`);
    
    if (!playersList) return;
    
    // Find and remove the player
    const playerItem = playersList.querySelector(`[data-player-id="${playerId}"]`);
    if (playerItem) {
      const playerName = playerItem.querySelector('.player-name')?.textContent || 'A player';
      playerItem.remove();
      
      // Update count
      if (countBadge) {
        const currentCount = parseInt(countBadge.textContent) || 0;
        countBadge.textContent = Math.max(0, currentCount - 1);
      }
      
      // If no players left, show the "no players" message
      if (playersList.children.length === 0) {
        playersList.innerHTML = '<div class="no-players">Waiting for players to join...</div>';
      }
      
      // Show message
      console.log(`${playerName} left the session`);
    }
  }
  
  startGame(sessionId) {
    console.log('Starting game in session:', sessionId);
    
    // DON'T close the WebSocket - we'll reuse it in the game!
    // The game will take over this connection
    
    // Get username from input
    const usernameInput = document.getElementById('username-input');
    const username = usernameInput ? usernameInput.value.trim() : '';
    
    // Hide menu with animation
    this.menuElement.style.animation = 'menuFadeIn 0.3s ease-out reverse';
    setTimeout(() => {
      this.menuElement.style.display = 'none';
      
      // Start the game with session ID, username, existing WebSocket, player ID, and session players
      this.onStartGame(sessionId, username, this.ws, this.playerId, this.sessionPlayers || []);
    }, 300);
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  disableGameElements() {
    // Disable pointer events on game canvas and controls
    const canvasContainer = document.getElementById('canvas-container');
    const mobileControls = document.getElementById('mobile-controls');
    const crosshair = document.getElementById('crosshair');
    const overlay = document.getElementById('overlay');
    
    if (canvasContainer) canvasContainer.style.pointerEvents = 'none';
    if (mobileControls) mobileControls.style.pointerEvents = 'none';
    if (crosshair) crosshair.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  }
  
  enableGameElements() {
    // Re-enable pointer events on game canvas and controls
    const canvasContainer = document.getElementById('canvas-container');
    const mobileControls = document.getElementById('mobile-controls');
    const crosshair = document.getElementById('crosshair');
    const overlay = document.getElementById('overlay');
    
    if (canvasContainer) canvasContainer.style.pointerEvents = 'auto';
    if (mobileControls) mobileControls.style.pointerEvents = 'none'; // Keep none, children have auto
    if (crosshair) crosshair.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
  }

  show() {
    if (this.menuElement) {
      this.menuElement.style.display = 'flex';
      this.disableGameElements();
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
    
    this.enableGameElements();
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
  
  startIdlingSession() {
    if (!this.isCreator) {
      this.showError('Only the host can start the game');
      return;
    }
    
    if (!this.currentSessionId) {
      this.showError('No active session');
      return;
    }
    
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.innerHTML = '<span class="spinner"></span> Starting...';
    }
    
    this.sendWSMessage({
      type: 'startSession',
      sessionId: this.currentSessionId
    });
  }
  
  leaveLobby() {
    if (confirm('Are you sure you want to leave the lobby?')) {
      this.closeWS();
      window.location.reload();
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
