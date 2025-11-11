// Multiplayer client using WebSockets
// Handles connection, player synchronization, and network updates

export class MultiplayerClient {
  constructor(scene, camera, localPlayer) {
    this.scene = scene;
    this.camera = camera;
    this.localPlayer = localPlayer;
    this.ws = null;
    this.playerId = null;
    this.remotePlayers = new Map();
    this.updateInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    
    this.connect();
  }
  
  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('Connecting to MMO server:', wsUrl);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('Connected to MMO server!');
        this.reconnectAttempts = 0;
        this.startUpdateLoop();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing server message:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      this.ws.onclose = () => {
        console.log('Disconnected from MMO server');
        this.stopUpdateLoop();
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.attemptReconnect();
    }
  }
  
  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }
  
  handleMessage(data) {
    switch (data.type) {
      case 'init':
        this.playerId = data.id;
        console.log('Assigned player ID:', this.playerId);
        
        // Add existing players
        data.players.forEach(playerData => {
          this.addRemotePlayer(playerData);
        });
        break;
        
      case 'playerJoined':
        console.log('Player joined:', data.player.id);
        this.addRemotePlayer(data.player);
        break;
        
      case 'playerLeft':
        console.log('Player left:', data.id);
        this.removeRemotePlayer(data.id);
        break;
        
      case 'playerUpdate':
        this.updateRemotePlayer(data);
        break;
    }
  }
  
  addRemotePlayer(playerData) {
    if (this.remotePlayers.has(playerData.id)) {
      return; // Player already exists
    }
    
    // Import THREE from global scope
    const THREE = window.THREE;
    
    // Create a simple representation for remote player
    const playerGroup = new THREE.Object3D();
    playerGroup.position.set(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );
    playerGroup.rotation.y = playerData.rotation.y;
    
    // Create a visible mesh (colored box for now, can be replaced with model)
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({
      color: this.getRandomPlayerColor(),
      metalness: 0.3,
      roughness: 0.7
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 1;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    playerGroup.add(mesh);
    
    // Add name tag
    const nameTag = this.createNameTag(playerData.id);
    nameTag.position.y = 3;
    playerGroup.add(nameTag);
    
    this.scene.add(playerGroup);
    
    this.remotePlayers.set(playerData.id, {
      group: playerGroup,
      mesh: mesh,
      targetPosition: { ...playerData.position },
      targetRotation: { ...playerData.rotation },
      currentAnimation: playerData.animation || 'idle'
    });
  }
  
  createNameTag(playerId) {
    const THREE = window.THREE;
    
    // Create canvas for name
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(playerId.substring(0, 6), canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 0.5, 1);
    
    return sprite;
  }
  
  getRandomPlayerColor() {
    const colors = [0x4a90e2, 0xe24a4a, 0x4ae24a, 0xe2e24a, 0xe24ae2, 0x4ae2e2];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  removeRemotePlayer(playerId) {
    const player = this.remotePlayers.get(playerId);
    if (player) {
      this.scene.remove(player.group);
      this.remotePlayers.delete(playerId);
    }
  }
  
  updateRemotePlayer(data) {
    const player = this.remotePlayers.get(data.id);
    if (player) {
      // Smooth interpolation target
      player.targetPosition = data.position;
      player.targetRotation = data.rotation;
      player.currentAnimation = data.animation;
    }
  }
  
  startUpdateLoop() {
    // Send updates to server at 20 Hz
    this.updateInterval = setInterval(() => {
      this.sendUpdate();
    }, 50);
  }
  
  stopUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  sendUpdate() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.localPlayer) {
      const update = {
        type: 'update',
        position: {
          x: this.localPlayer.position.x,
          y: this.localPlayer.position.y,
          z: this.localPlayer.position.z
        },
        rotation: {
          y: this.localPlayer.rotation.y
        },
        animation: this.getCurrentAnimation()
      };
      
      this.ws.send(JSON.stringify(update));
    }
  }
  
  getCurrentAnimation() {
    // This will be set from the main game loop
    return this.currentAnimation || 'idle';
  }
  
  setCurrentAnimation(animation) {
    this.currentAnimation = animation;
  }
  
  update(delta) {
    // Smooth interpolation for remote players
    this.remotePlayers.forEach((player) => {
      // Lerp position
      player.group.position.x += (player.targetPosition.x - player.group.position.x) * 0.3;
      player.group.position.y += (player.targetPosition.y - player.group.position.y) * 0.3;
      player.group.position.z += (player.targetPosition.z - player.group.position.z) * 0.3;
      
      // Lerp rotation
      let targetY = player.targetRotation.y;
      let currentY = player.group.rotation.y;
      
      // Handle angle wrapping
      let diff = targetY - currentY;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      
      player.group.rotation.y += diff * 0.3;
      
      // Make name tag face camera
      if (player.group.children[1]) {
        player.group.children[1].lookAt(this.camera.position);
      }
    });
  }
  
  disconnect() {
    this.stopUpdateLoop();
    if (this.ws) {
      this.ws.close();
    }
  }
  
  getPlayerCount() {
    return this.remotePlayers.size + 1; // +1 for local player
  }
}
