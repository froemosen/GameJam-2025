// Minimal Three.js game template (ES module)
// - Mohamed character controlled with WASD / arrows
// - Camera follows the character
// - Pointer lock for mouse-look
// - Animation blending (idle, walk, run)

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.0/build/index.module.js';

// Add BVH functions to THREE.BufferGeometry
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const container = document.getElementById('canvas-container');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
container.appendChild(renderer.domElement);

// CSS3D Renderer for iframe
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
cssRenderer.domElement.style.position = 'absolute';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.pointerEvents = 'none'; // Let pointer lock work
container.appendChild(cssRenderer.domElement);

// Scene & Camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

// Lighting
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
hemi.position.set(0, 200, 0);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(5, 10, 7.5);
dir.castShadow = true;
// Configure shadow properties
dir.shadow.mapSize.width = 2048;
dir.shadow.mapSize.height = 2048;
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 50;
dir.shadow.camera.left = -20;
dir.shadow.camera.right = 20;
dir.shadow.camera.top = 20;
dir.shadow.camera.bottom = -20;
scene.add(dir);

// Random Terrain Generation
const terrainSize = 200;
const terrainSegments = 40; // Reduced from 100 for less detail and better collision
const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);

// Generate random heights for terrain
const vertices = terrainGeo.attributes.position.array;
const heightMap = []; // Store heights for collision detection
const segmentSize = terrainSize / terrainSegments;

// Initialize heightMap
for (let i = 0; i <= terrainSegments; i++) {
  heightMap[i] = [];
}

for (let i = 0; i < vertices.length; i += 3) {
  const x = vertices[i];
  const z = vertices[i + 1];
  
  // Create rolling hills with Perlin-like noise (simplified)
  const height = 
    Math.sin(x * 0.05) * 3 +
    Math.cos(z * 0.05) * 3 +
    Math.sin(x * 0.1) * 1.5 +
    Math.cos(z * 0.1) * 1.5;
  
  vertices[i + 2] = height; // Set the Y (up) coordinate
  
  // Store in heightMap for lookup
  const gridX = Math.round((x + terrainSize / 2) / segmentSize);
  const gridZ = Math.round((z + terrainSize / 2) / segmentSize);
  heightMap[gridX][gridZ] = height;
}

terrainGeo.attributes.position.needsUpdate = true;
terrainGeo.computeVertexNormals(); // Recalculate normals for proper lighting

// Create solid green base terrain
const baseTerrainMat = new THREE.MeshStandardMaterial({ 
  color: 0x556b2f,
  flatShading: false,
  side: THREE.DoubleSide
});
const baseTerrain = new THREE.Mesh(terrainGeo, baseTerrainMat);
baseTerrain.rotation.x = -Math.PI / 2;
baseTerrain.receiveShadow = true;
baseTerrain.castShadow = true;
scene.add(baseTerrain);

// Load ground texture for overlay
const textureLoader = new THREE.TextureLoader();
const groundTexture = textureLoader.load('./assets/groundtexture.png');
groundTexture.wrapS = THREE.RepeatWrapping;
groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(20, 20); // Repeat texture across terrain

// Create semi-transparent textured layer on top
const terrainGeo2 = terrainGeo.clone();
const terrainMat = new THREE.MeshStandardMaterial({ 
  map: groundTexture,
  transparent: true,
  opacity: 0.6, // Make texture semi-transparent
  flatShading: false,
  side: THREE.DoubleSide,
  depthWrite: false // Prevent z-fighting with base layer
});
const terrain = new THREE.Mesh(terrainGeo2, terrainMat);
terrain.rotation.x = -Math.PI / 2;
terrain.position.y = 0.01; // Slightly above base to prevent z-fighting
scene.add(terrain);

// Water level constant
const WATER_LEVEL = 0;

// Add water plane at the bottom of the hills (Y=0)
const waterGeo = new THREE.PlaneGeometry(terrainSize, terrainSize);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x1e90ff, // Blue water color
  transparent: true,
  opacity: 0.6,
  roughness: 0.1,
  metalness: 0.2,
  side: THREE.DoubleSide
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = WATER_LEVEL; // At the water level
water.receiveShadow = true;
scene.add(water);

// Function to get terrain height at any X,Z position with bilinear interpolation
function getTerrainHeight(x, z) {
  // Convert world position to grid position
  const gridX = (x + terrainSize / 2) / segmentSize;
  const gridZ = (z + terrainSize / 2) / segmentSize;
  
  // Get the four surrounding grid points
  const x0 = Math.floor(gridX);
  const x1 = x0 + 1;
  const z0 = Math.floor(gridZ);
  const z1 = z0 + 1;
  
  // Bounds check
  if (x0 < 0 || x1 > terrainSegments || z0 < 0 || z1 > terrainSegments) {
    return 0;
  }
  
  // Get heights at the four corners
  const h00 = heightMap[x0] && heightMap[x0][z0] !== undefined ? heightMap[x0][z0] : 0;
  const h10 = heightMap[x1] && heightMap[x1][z0] !== undefined ? heightMap[x1][z0] : 0;
  const h01 = heightMap[x0] && heightMap[x0][z1] !== undefined ? heightMap[x0][z1] : 0;
  const h11 = heightMap[x1] && heightMap[x1][z1] !== undefined ? heightMap[x1][z1] : 0;
  
  // Interpolation factors
  const fx = gridX - x0;
  const fz = gridZ - z0;
  
  // Bilinear interpolation
  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  const height = h0 * (1 - fz) + h1 * fz;
  
  return height;
}

// Function to calculate terrain normal (slope) at position
function getTerrainNormal(x, z) {
  const offset = 0.5; // Sample distance for calculating slope
  
  // Get heights at nearby points
  const hCenter = getTerrainHeight(x, z);
  const hLeft = getTerrainHeight(x - offset, z);
  const hRight = getTerrainHeight(x + offset, z);
  const hForward = getTerrainHeight(x, z + offset);
  const hBack = getTerrainHeight(x, z - offset);
  
  // Calculate slope in X and Z directions
  const slopeX = (hRight - hLeft) / (2 * offset);
  const slopeZ = (hForward - hBack) / (2 * offset);
  
  // Create normal vector
  const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
  
  return normal;
}

// Character placeholder (will be replaced with Mohamed model)
const character = new THREE.Object3D();
const startHeight = getTerrainHeight(0, 0);
character.position.set(0, startHeight, 0);
scene.add(character);

// Mohamed model and animations
let mohamedModel = null;
let mixer = null;
let animations = {};
let currentAction = null;

// Audio setup
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const audioLoader = new THREE.AudioLoader();

const themeSound = new THREE.Audio(audioListener);

// Create audio objects for different states
const walkingSound = new THREE.Audio(audioListener);
const runningSound = new THREE.Audio(audioListener);
const swimmingSound = new THREE.Audio(audioListener);
const jumpingSound = new THREE.Audio(audioListener);

// Load sounds
audioLoader.load('./assets/vimmersvej.m4a', (buffer) => {
  themeSound.setBuffer(buffer);
  themeSound.setLoop(true);
  themeSound.setVolume(0.4);
})

themeSound.play();

audioLoader.load('./assets/walking_elephant.m4a', (buffer) => {
  walkingSound.setBuffer(buffer);
  walkingSound.setLoop(true);
  walkingSound.setVolume(0.5);
  walkingSound.playbackRate = 1.15;
});

audioLoader.load('/assets/running_elephant.m4a', (buffer) => {
  runningSound.setBuffer(buffer);
  runningSound.setLoop(true);
  runningSound.setVolume(0.5);
  runningSound.playbackRate = 1.25;
});

audioLoader.load('./assets/swimming_elephant.m4a', (buffer) => {
  swimmingSound.setBuffer(buffer);
  swimmingSound.setLoop(true);
  swimmingSound.setVolume(0.5);
  swimmingSound.playbackRate = 1.5;
});

audioLoader.load('./assets/jumping_elephant.wav', (buffer) => {
  jumpingSound.setBuffer(buffer);
  jumpingSound.setLoop(false);
  jumpingSound.setVolume(0.05);
  jumpingSound.playbackRate = 2;
});

const loader = new GLTFLoader();

// Load the character model and animations
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
  mohamedModel = characterGltf.scene;
  mohamedModel.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  
  character.add(mohamedModel);
  
  // Setup animation mixer
  mixer = new THREE.AnimationMixer(mohamedModel);
  
  // Store animations
  animations.idle = mixer.clipAction(idleGltf.animations[0]);
  animations.walk = mixer.clipAction(walkGltf.animations[0]);
  animations.run = mixer.clipAction(runGltf.animations[0]);
  animations.swim = mixer.clipAction(swimGltf.animations[0]);
  
  // Start with idle
  animations.idle.play();
  currentAction = animations.idle;
  
  console.log('Mohamed loaded with animations!');
}).catch(err => {
  console.error('Error loading Mohamed:', err);
  // Fallback: add a visible box if model fails to load
  const fallback = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshStandardMaterial({ color: 0xff6b6b })
  );
  fallback.position.y = 1;
  character.add(fallback);
});

// Simple obstacles
for (let i = 0; i < 8; i++) {
  const b = new THREE.Mesh(
    new THREE.BoxGeometry(1 + Math.random() * 3, 1 + Math.random() * 4, 1 + Math.random() * 3),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
  );
  b.position.set((Math.random() - 0.5) * 40, b.geometry.parameters.height / 2, (Math.random() - 0.5) * 40);
  b.castShadow = true;
  b.receiveShadow = true;
  scene.add(b);
}

// Load Castle of Loarre at the edge of the world
let venueModel = null;
let ocamlModel = null;

// Castle meshes for BVH collision
let venueMeshes = [];

// Screenshot and iframe functionality
let screenshotMesh = null;
let venueIframe = null;
let venueCSS3DObject = null;
let isVenueIframeVisible = false;

loader.load('./assets/venue.glb', (gltf) => {
  venueModel = gltf.scene;
  
  // Scale the castle
  venueModel.scale.set(2,2,2);
  
  // Position at the very edge of the world (terrain is 200x200, center at 0,0)
  // Place it so the edge of castle is at the edge of terrain
  const edgeX = 0; // Near the edge at x=100
  const edgeZ = 0; // Near the edge at z=100
  
  const venueGroundHeight = getTerrainHeight(edgeX, edgeZ)+3;
  venueModel.position.set(edgeX, venueGroundHeight, edgeZ);
  
  // Build BVH for all castle meshes and collect them
  venueModel.traverse((node) => {
    if (node.isMesh) {
      // Compute BVH for accurate collision
      node.geometry.computeBoundsTree();
      venueMeshes.push(node);
      
      // Enable shadows
      node.castShadow = true;
      node.receiveShadow = true;
      
      // Add debug wireframe to show collision mesh
      const wireframeGeometry = new THREE.WireframeGeometry(node.geometry);
      const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
      const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      wireframe.position.copy(node.position);
      wireframe.rotation.copy(node.rotation);
      wireframe.scale.copy(node.scale);
      node.add(wireframe); // Attach to the mesh so it moves with it
    }
  });
  
  scene.add(venueModel);
  console.log('Venue loaded with', venueMeshes.length, 'meshes for collision');
  
  // Create a clickable screenshot inside the venue
  const screen
  const screenshotTexture = textureLoader.load('./assets/au-room-schedule-screenshot.png'); // Placeholder texture
  const screenshotGeometry = new THREE.PlaneGeometry(20, ); // Screen size
  const screenshotMaterial = new THREE.MeshStandardMaterial({ 
    map: screenshotTexture,
    side: THREE.DoubleSide,
    emissive: 0x222222,
    emissiveIntensity: 0.3
  });
  screenshotMesh = new THREE.Mesh(screenshotGeometry, screenshotMaterial);
  
  // Position screenshot inside the venue (adjust as needed)
  screenshotMesh.position.set(edgeX, venueGroundHeight + 5, edgeZ - 10);
  screenshotMesh.rotation.y = Math.PI; // Face towards the entrance
  screenshotMesh.userData.isClickable = true;
  scene.add(screenshotMesh);
  
  console.log('Screenshot added to venue at:', screenshotMesh.position);
  
}, undefined, (err) => {
  console.error('Error loading venue:', err);
});

// OCaml meshes for collision and animation
let ocamlMeshes = [];
let ocamlMixer = null;

// Load OCaml at spawn position
loader.load('./assets/OCamlHeadBop.glb', (ocamlGltf) => {
  ocamlModel = ocamlGltf.scene;
  
  // Scale OCaml to 2x Mohamed's size (Mohamed is roughly 2 units tall)
  ocamlModel.scale.set(6, 6, 6);
  
  // Position at spawn (0, 0) on the terrain;
  ocamlModel.position.set(3.7, 8.2, 18.2);

  // Rotate him 180 degrees to face the camera
  ocamlModel.rotation.y = Math.PI;  
  
  // Build BVH for OCaml meshes and enable shadows
  ocamlModel.traverse((node) => {
    if (node.isMesh) {
      // Compute BVH for accurate collision
      node.geometry.computeBoundsTree();
      ocamlMeshes.push(node);
      
      node.castShadow = true;
      node.receiveShadow = true;
      
      // Add debug wireframe to show collision mesh
      const wireframeGeometry = new THREE.WireframeGeometry(node.geometry);
      const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
      const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      wireframe.position.copy(node.position);
      wireframe.rotation.copy(node.rotation);
      wireframe.scale.copy(node.scale);
      node.add(wireframe); // Attach to the mesh so it moves with it
    }
  });
  
  // Setup animation mixer for OCaml if animations exist
  if (ocamlGltf.animations && ocamlGltf.animations.length > 0) {
    ocamlMixer = new THREE.AnimationMixer(ocamlModel);
    const ocamlAction = ocamlMixer.clipAction(ocamlGltf.animations[0]);
    ocamlAction.play();
    console.log('OCaml animation activated!');
  }
  
  scene.add(ocamlModel);


  console.log('OCaml placed at spawn position with', ocamlMeshes.length, 'meshes for collision');
}, undefined, (err) => {
  console.error('Error loading OCaml:', err);
});

// Create cinema-style screen with iframe
const iframe = document.createElement('iframe');
iframe.src = 'https://bytes-theta-gets-interior.trycloudflare.com/';
iframe.style.width = '1920px';
iframe.style.height = '1080px';
iframe.style.border = '0';
iframe.style.pointerEvents = 'auto'; // Enable interaction with iframe

const css3DObject = new CSS3DObject(iframe);
css3DObject.position.set(50, 15, 50); // Position near spawn
css3DObject.rotation.y = (Math.PI*1.2) ; // Angle towards spawn
css3DObject.scale.set(0.02, 0.02, 0.02); // Scale down to reasonable size
//scene.add(css3DObject);

// Create a backing plane for the cinema screen (black frame)
const screenGeometry = new THREE.PlaneGeometry(38.4, 21.6); // 16:9 aspect ratio
const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
const screenMesh = new THREE.Mesh(screenGeometry, screenMaterial);
screenMesh.position.copy(css3DObject.position);
screenMesh.rotation.copy(css3DObject.rotation);
screenMesh.position.z += 1; // Slightly behind the iframe
//scene.add(screenMesh);

console.log('Cinema screen created at position:', css3DObject.position);

// Function to show venue iframe
function showVenueIframe() {
  if (!venueIframe) {
    // Create iframe for venue screenshot
    venueIframe = document.createElement('iframe');
    venueIframe.src = 'http://TEST';
    venueIframe.style.width = '1920px';
    venueIframe.style.height = '1080px';
    venueIframe.style.border = '0';
    venueIframe.style.pointerEvents = 'auto';
    
    venueCSS3DObject = new CSS3DObject(venueIframe);
    venueCSS3DObject.position.set(0, 10, -50); // Position in front of camera
    venueCSS3DObject.scale.set(0.02, 0.02, 0.02);
    scene.add(venueCSS3DObject);
  }
  
  // Exit pointer lock to allow iframe interaction
  document.exitPointerLock();
  isVenueIframeVisible = true;
  cssRenderer.domElement.style.pointerEvents = 'auto';
  
  // Update iframe position relative to camera
  updateVenueIframePosition();
  
  console.log('Venue iframe displayed');
}

// Function to hide venue iframe
function hideVenueIframe() {
  if (venueCSS3DObject && isVenueIframeVisible) {
    scene.remove(venueCSS3DObject);
    isVenueIframeVisible = false;
    cssRenderer.domElement.style.pointerEvents = 'none';
    
    // Re-lock pointer
    renderer.domElement.requestPointerLock();
    
    console.log('Venue iframe hidden');
  }
}

// Function to update iframe position to follow camera
function updateVenueIframePosition() {
  if (venueCSS3DObject && isVenueIframeVisible) {
    // Position iframe in front of camera
    const distance = 50;
    const iframeX = camera.position.x - Math.sin(cameraYaw) * distance;
    const iframeZ = camera.position.z - Math.cos(cameraYaw) * distance;
    const iframeY = camera.position.y;
    
    venueCSS3DObject.position.set(iframeX, iframeY, iframeZ);
    venueCSS3DObject.rotation.y = cameraYaw;
  }
}

// Camera rotation state
let cameraYaw = 0; // Horizontal rotation (left-right)
let cameraPitch = 0.3; // Vertical rotation (up-down), start slightly looking down
let isPointerLocked = false;
let isCinemaMode = false;

// Raycaster for click detection
const clickRaycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Request pointer lock on click
document.addEventListener('click', (event) => {
  // Check if clicking on screenshot when pointer is locked
  if (isPointerLocked && screenshotMesh) {
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = 0; // Center of screen in pointer lock
    mouse.y = 0;
    
    clickRaycaster.setFromCamera(mouse, camera);
    const intersects = clickRaycaster.intersectObject(screenshotMesh);
    
    if (intersects.length > 0) {
      // Clicked on screenshot - show iframe
      showVenueIframe();
      return;
    }
  }
  
  renderer.domElement.requestPointerLock();
});

// Track pointer lock state
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
  if (!isPointerLocked && isCinemaMode) {
    // Exited pointer lock while in cinema mode - exit cinema mode
    isCinemaMode = false;
    cssRenderer.domElement.style.pointerEvents = 'none';
    const indicator = document.getElementById('cinema-mode-indicator');
    if (indicator) indicator.style.display = 'none';
  }
});
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
});

// Mouse movement for camera rotation
document.addEventListener('mousemove', (e) => {
  if (!isPointerLocked) return;
  
  const sensitivity = 0.003;
  cameraYaw -= e.movementX * sensitivity;
  cameraPitch -= e.movementY * sensitivity;
  
  // Clamp pitch to prevent camera flipping
  cameraPitch = Math.max(-Math.PI / 2 + 0.7, Math.min(Math.PI / 2 - 0.90, cameraPitch));
});

// Movement state
const move = { forward: 0, right: 0, up: 0, sprint: false };
let canJump = true;
let velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

function onKeyDown(e) {
  // Check for Escape key to close venue iframe
  if (e.code === 'Escape' && isVenueIframeVisible) {
    hideVenueIframe();
    return;
  }
  
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW': move.forward = 1; break;
    case 'ArrowLeft':
    case 'KeyA': move.right = 1; break;
    case 'ArrowDown':
    case 'KeyS': move.forward = -1; break;
    case 'ArrowRight':
    case 'KeyD': move.right = -1; break;
    case 'Space':
      if (canJump) { 
        velocity.y += 10; 
        canJump = false;
        // Play jump sound
        if (jumpingSound.buffer && !jumpingSound.isPlaying) {
          jumpingSound.play();
        }
      }
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      move.sprint = true;
      break;
    case 'KeyE':
      // Toggle cinema interaction mode
      if (!isCinemaMode) {
        // Exit pointer lock to enable cursor
        if (isPointerLocked) {
          document.exitPointerLock();
        }
        isCinemaMode = true;
        cssRenderer.domElement.style.pointerEvents = 'auto';
        const indicator = document.getElementById('cinema-mode-indicator');
        if (indicator) indicator.style.display = 'block';
        console.log('Cinema mode enabled - cursor active');
      } else {
        // Re-lock pointer and disable cinema interaction
        isCinemaMode = false;
        cssRenderer.domElement.style.pointerEvents = 'none';
        const indicator = document.getElementById('cinema-mode-indicator');
        if (indicator) indicator.style.display = 'none';
        renderer.domElement.requestPointerLock();
        console.log('Cinema mode disabled - pointer locked');
      }
      break;
  }
}
function onKeyUp(e) {
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW': if (move.forward === 1) move.forward = 0; break;
    case 'ArrowLeft':
    case 'KeyA': if (move.right === 1) move.right = 0; break;
    case 'ArrowDown':
    case 'KeyS': if (move.forward === -1) move.forward = 0; break;
    case 'ArrowRight':
    case 'KeyD': if (move.right === -1) move.right = 0; break;
    case 'ShiftLeft':
    case 'ShiftRight':
      move.sprint = false;
      break;
  }
}
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);



// Camera follow offset
const cameraOffset = new THREE.Vector3(0, 4, 6);

// Clock
const clock = new THREE.Clock();

// Helper to smoothly transition between animations
function fadeToAction(newAction, duration = 0.3) {
  if (currentAction && currentAction !== newAction) {
    currentAction.fadeOut(duration);
  }
  newAction.reset().fadeIn(duration).play();
  currentAction = newAction;
}

let desiredCamPos = null

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());

  // Update animation mixers
  if (mixer) {
    mixer.update(delta);
  }
  if (ocamlMixer) {
    ocamlMixer.update(delta);
  }

  // Movement physics
  const walkSpeed = 3;
  const runSpeed = 6;
  let speed = walkSpeed;
  
  // Apply gravity
  velocity.y -= 9.8 * delta;

  // direction in local space relative to camera orientation
  direction.set(0, 0, 0);
  if (move.forward) direction.z = -move.forward;
  if (move.right) direction.x = move.right;

  const isMoving = direction.lengthSq() > 0;
  
  if (isMoving) {
    direction.normalize();
    
    // Determine if running (Shift key) - for now just use faster speed threshold
    const isRunning = move.sprint;
    speed = isRunning ? runSpeed : walkSpeed;
    
    // Calculate movement direction relative to camera yaw
    const cos = Math.cos(cameraYaw);
    const sin = Math.sin(cameraYaw);
    const dx = direction.x * cos - direction.z * sin;
    const dz = direction.x * sin + direction.z * cos;
    
    // Store old position for collision detection
    const oldX = character.position.x;
    const oldZ = character.position.z;
    
    // Apply movement
    character.position.x += -dx * speed * delta;
    character.position.z += dz * speed * delta;
    
    // Check for horizontal collision with venue and OCaml
    const collidableMeshes = [...ocamlMeshes, ...venueMeshes];
    if (collidableMeshes.length > 0) {
      const horizontalRaycaster = new THREE.Raycaster();
      const playerHeight = 1.0; // Check at player's center height
      const rayOrigin = new THREE.Vector3(character.position.x, character.position.y + playerHeight, character.position.z);
      const moveDirection = new THREE.Vector3(-dx, 0, dz).normalize();
      
      horizontalRaycaster.set(rayOrigin, moveDirection);
      horizontalRaycaster.far = 2; // Check 2 units ahead
      
      const horizontalIntersects = horizontalRaycaster.intersectObjects(collidableMeshes, false);
      
      if (horizontalIntersects.length > 0 && horizontalIntersects[0].distance < 1.5) {
        // Collision detected - revert position
        character.position.x = oldX;
        character.position.z = oldZ;
      }
    }
    
    // Rotate Mohamed to face movement direction (inverted to match camera perspective)
    if (mohamedModel) {
      const targetAngle = Math.atan2(dx, dz);
      mohamedModel.rotation.y = -targetAngle;
    }
  }

  // Apply vertical velocity and stop at terrain
  character.position.y += velocity.y * delta;
  
  // Get terrain height at character's position
  let terrainHeight = getTerrainHeight(character.position.x, character.position.z);
  
  // Check castle and OCaml collision using BVH raycasting
  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3(character.position.x, 100, character.position.z);
  const rayDirection = new THREE.Vector3(0, -1, 0);
  raycaster.set(rayOrigin, rayDirection);
  
  // Combine all collidable meshes
  const collidableMeshes = [...ocamlMeshes, ...venueMeshes];
  
  if (collidableMeshes.length > 0) {
    // Check intersection with all meshes
    const intersects = raycaster.intersectObjects(collidableMeshes, false);
    
    if (intersects.length > 0) {
      // Find the highest intersect that is below the player's head
      const playerHeadHeight = character.position.y + 2; // Player head is ~2 units above position
      let validMeshHeight = terrainHeight;
      
      for (const intersect of intersects) {
        const intersectY = intersect.point.y;
        // Only consider this surface as floor if it's below the player's head
        if (intersectY < playerHeadHeight) {
          validMeshHeight = Math.max(validMeshHeight, intersectY);
        }
      }
      
      terrainHeight = validMeshHeight;
    }
  }
  
  // Minimum Y position (swimming depth limit)
  const MIN_Y = -0.85;
  
  // Check if in water (terrain is below water level)
  const isInWater = terrainHeight <= WATER_LEVEL;
  
  if (isInWater) {
    // Follow terrain but clamp to minimum depth
    const targetY = Math.max(MIN_Y, terrainHeight);
    
    if (character.position.y < targetY) {
      character.position.y = targetY;
      velocity.y = 0;
    }
    
    canJump = false; // Can't jump while swimming
    
    // Swimming animation
    if (isMoving && animations.swim) {
      if (currentAction !== animations.swim) {
        fadeToAction(animations.swim);
      }
      // Play swimming sound
      if (swimmingSound.buffer && !swimmingSound.isPlaying) {
        swimmingSound.play();
      }
      // Stop walking and running sound if playing
      if (runningSound.isPlaying) {
        runningSound.stop();
      }
      if (walkingSound.isPlaying) {
        walkingSound.stop();
      }
    } else {
      if (animations.idle && currentAction !== animations.idle) {
        fadeToAction(animations.idle);
      }
      // Stop swimming sound when idle
      if (swimmingSound.isPlaying) {
        swimmingSound.stop();
      }
    }
    
    // Keep Mohamed upright while swimming (no terrain slope alignment)
    if (mohamedModel) {
      const currentYRotation = mohamedModel.rotation.y;
      mohamedModel.rotation.set(0, currentYRotation, 0);
    }
  } else {
    // On land
    if (character.position.y < terrainHeight) {
      velocity.y = 0;
      character.position.y = terrainHeight;
      canJump = true;
    }
    
    // Animation blending based on speed (on land)
    if (isMoving) {
      const isRunning = move.sprint;
      if (animations.run && animations.walk && isRunning) {
        if (currentAction !== animations.run) {
          fadeToAction(animations.run);
        }
        if (!runningSound.isPlaying) runningSound.play();  
        if (walkingSound.isPlaying) walkingSound.stop();
    } else if (animations.walk) {
        if (currentAction !== animations.walk) {
          fadeToAction(animations.walk);
        }
        // Play walking sound
        if(!walkingSound.isPlaying) walkingSound.play();
        if (runningSound.isPlaying) runningSound.stop();
      }
      
      
      // Stop swimming sound if playing
      if (swimmingSound.isPlaying) {
        swimmingSound.stop();
      }
    } else {
      // Idle animation when not moving
      if (animations.idle && currentAction !== animations.idle) {
        fadeToAction(animations.idle);
      }
      // Stop walking sound when idle
      if (walkingSound.isPlaying) {
        walkingSound.stop();
      }
      if (runningSound.isPlaying) {
        runningSound.stop();
      }
    }
    
    // Align Mohamed to terrain slope (only on land)
    if (mohamedModel && canJump) {
      const terrainNormal = getTerrainNormal(character.position.x, character.position.z);
      
      // Calculate the rotation to align with terrain
      // We want the character's up vector to match the terrain normal
      const upVector = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, terrainNormal);
      
    
    }

    console.log('Character Y:', character.position.y.toFixed(2), 'Terrain Height:', terrainHeight.toFixed(2));
    
  }

  // Position camera based on yaw and pitch
  const distance = cameraOffset.z;
  const height = cameraOffset.y;
  
  const camX = character.position.x + Math.sin(cameraYaw) * distance * Math.cos(cameraPitch);
  const camZ = character.position.z + Math.cos(cameraYaw) * distance * Math.cos(cameraPitch);
  const camY = character.position.y + height + Math.sin(-cameraPitch) * distance;
  
  desiredCamPos = new THREE.Vector3(camX, camY, camZ);
  
  // Smooth camera movement
  camera.position.lerp(desiredCamPos, 1 - Math.pow(0.01, delta));
  camera.lookAt(character.position.x, character.position.y + 1.0, character.position.z);

  // Update shadow camera to follow Mohamed for better shadow quality
  dir.position.set(
    character.position.x + 5,
    character.position.y + 10,
    character.position.z + 7.5
  );
  dir.target.position.copy(character.position);
  dir.target.updateMatrixWorld();

  // Update coordinates display
  const coordsElement = document.getElementById('coordinates');
  if (coordsElement) {
    coordsElement.textContent = `Position: X: ${character.position.x.toFixed(1)}, Y: ${character.position.y.toFixed(1)}, Z: ${character.position.z.toFixed(1)}`;
  }

  // Update venue iframe position if visible
  if (isVenueIframeVisible) {
    updateVenueIframePosition();
  }

  renderer.render(scene, camera);
  cssRenderer.render(scene, camera); // Render CSS3D layer
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  cssRenderer.setSize(window.innerWidth, window.innerHeight);
});

// Put the camera initially behind the character
const distance = cameraOffset.z;
const height = cameraOffset.y;
camera.position.set(
  character.position.x + Math.sin(cameraYaw) * distance,
  character.position.y + height,
  character.position.z + Math.cos(cameraYaw) * distance
);
camera.lookAt(character.position);

// Start
animate();


