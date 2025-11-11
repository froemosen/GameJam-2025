// Multiplayer client using WebSockets
// Handles connection, player synchronization, and network updates

export class MultiplayerClient {
  constructor(scene, camera, localPlayer, username = null) {
    this.scene = scene;
    this.camera = camera;
    this.localPlayer = localPlayer;
    this.username = username || 'Player' + Math.floor(Math.random() * 1000);
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
        
        // Send username to server
        this.ws.send(JSON.stringify({
          type: 'setUsername',
          username: this.username
        }));
        
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
        
      case 'usernameUpdate':
        console.log('Player username updated:', data.id, data.username);
        this.updatePlayerUsername(data.id, data.username);
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
    
    // Create a temporary placeholder box until Mohamed model loads
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({
      color: this.getRandomPlayerColor(),
      metalness: 0.3,
      roughness: 0.7
    });
    const tempMesh = new THREE.Mesh(geometry, material);
    tempMesh.position.y = 1;
    tempMesh.castShadow = true;
    tempMesh.receiveShadow = true;
    playerGroup.add(tempMesh);
    
    // Add name tag (use username if available, otherwise use ID)
    const playerName = playerData.username || playerData.id.substring(0, 8);
    const nameTag = this.createNameTag(playerName);
    nameTag.position.y = 3;
    playerGroup.add(nameTag);
    
    this.scene.add(playerGroup);
    
    const playerState = {
      group: playerGroup,
      mesh: tempMesh,
      targetPosition: { ...playerData.position },
      targetRotation: { ...playerData.rotation },
      currentAnimation: playerData.animation || 'idle',
      mixer: null,
      animations: {}
    };
    
    this.remotePlayers.set(playerData.id, playerState);
    
    // Load Mohamed model for remote player (same as local player)
    this.loadMohamedForPlayer(playerData.id, playerState);
  }
  
  loadMohamedForPlayer(playerId, playerState) {
    const THREE = window.THREE;
    const GLTFLoader = window.GLTFLoader;
    const DRACOLoader = window.DRACOLoader;
    
    if (!GLTFLoader) {
      console.warn('GLTFLoader not available, using box placeholder');
      return;
    }
    
    const loader = new GLTFLoader();
    
    // Setup DRACO loader if available
    if (DRACOLoader) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      dracoLoader.setDecoderConfig({ type: 'js' });
      loader.setDRACOLoader(dracoLoader);
    }
    
    // Load Mohamed model and animations for remote player
    Promise.all([
      new Promise((resolve, reject) => {
        loader.load('./assets/mohamed/Character_output.glb', resolve, undefined, reject);
      }),
      new Promise((resolve, reject) => {
        loader.load('./assets/mohamed/Animation_Idle_withSkin.glb', resolve, undefined, reject);
      }),
      new Promise((resolve, reject) => {
        loader.load('./assets/mohamed/Animation_Walking_withSkin.glb', resolve, undefined, reject);
      }),
      new Promise((resolve, reject) => {
        loader.load('./assets/mohamed/Animation_Running_withSkin.glb', resolve, undefined, reject);
      }),
      new Promise((resolve, reject) => {
        loader.load('./assets/mohamed/Animation_Run_03_withSkin.glb', resolve, undefined, reject);
      })
    ]).then(([characterGltf, idleGltf, walkGltf, runGltf, swimGltf]) => {
      // Check if player still exists (might have disconnected during loading)
      if (!this.remotePlayers.has(playerId)) {
        return;
      }
      
      const mohamedModel = characterGltf.scene;
      mohamedModel.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      
      // Remove temp box placeholder
      playerState.group.remove(playerState.mesh);
      
      // Add Mohamed model
      playerState.group.add(mohamedModel);
      playerState.mesh = mohamedModel;
      
      // Setup animation mixer
      playerState.mixer = new THREE.AnimationMixer(mohamedModel);
      playerState.animations.idle = playerState.mixer.clipAction(idleGltf.animations[0]);
      playerState.animations.walk = playerState.mixer.clipAction(walkGltf.animations[0]);
      playerState.animations.run = playerState.mixer.clipAction(runGltf.animations[0]);
      playerState.animations.swim = playerState.mixer.clipAction(swimGltf.animations[0]);
      
      // Start with idle animation
      playerState.animations.idle.play();
      playerState.currentAction = playerState.animations.idle;
      
      console.log(`Mohamed model loaded for remote player ${playerId}`);
    }).catch(err => {
      console.error(`Error loading Mohamed for player ${playerId}:`, err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      // Keep using box placeholder if model fails to load
    });
  }
  
  createNameTag(playerName) {
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
    ctx.fillText(playerName, canvas.width / 2, canvas.height / 2);
    
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
  
  updatePlayerUsername(playerId, username) {
    const player = this.remotePlayers.get(playerId);
    if (player) {
      // Find and remove old name tag (it's the last child)
      const nameTag = player.group.children[player.group.children.length - 1];
      if (nameTag && nameTag.isSprite) {
        player.group.remove(nameTag);
      }
      
      // Add new name tag with updated username
      const newNameTag = this.createNameTag(username);
      newNameTag.position.y = 3;
      player.group.add(newNameTag);
      
      console.log(`Updated name tag for player ${playerId} to ${username}`);
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
      // Update animation mixer if available
      if (player.mixer) {
        player.mixer.update(delta);
        
        // Update animation based on current state
        if (player.animations && player.currentAnimation) {
          const targetAnim = player.animations[player.currentAnimation];
          if (targetAnim && player.currentAction !== targetAnim) {
            // Fade to new animation
            if (player.currentAction) {
              player.currentAction.fadeOut(0.3);
            }
            targetAnim.reset().fadeIn(0.3).play();
            player.currentAction = targetAnim;
          }
        }
      }
      
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
      
      // Make name tag face camera (it's the last child after Mohamed model is loaded)
      const nameTag = player.group.children[player.group.children.length - 1];
      if (nameTag && nameTag.isSprite) {
        nameTag.lookAt(this.camera.position);
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
