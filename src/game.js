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

const KRISTIAN_APP = "https://recruitment-dealers-ebooks-agree.trycloudflare.com/"
const KRISTIAN_SCREENSHOT = "./assets/kristianScreenshot.png"
const MIKKEL_APP = "https://appeared-dean-accordance-shelf.trycloudflare.com"
const MIKKEL_SCREENSHOT = "./assets/mikkelScreenshot.jpg"
const wireframeDebug = false;

let ocamlMixers = [];
let ocamlsMeshes = [];

// Boris Johnson variables
let borisModel = null;
let borisSound = null;
let borisPosition = new THREE.Vector3();
let borisMixer = null;
let borisAction = null;


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
const terrainSize = 1000;
const terrainSegments = 400; // Reduced from 100 for less detail and better collision
const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);

// Generate random heights for terrain
const vertices = terrainGeo.attributes.position.array;
const heightMap = []; // Store heights for collision detection
const segmentSize = terrainSize / terrainSegments;
const maxDistanceFromCenter = Math.sqrt((terrainSize/2) * (terrainSize/2) * 2); // Diagonal distance

// Initialize heightMap
for (let i = 0; i <= terrainSegments; i++) {
  heightMap[i] = [];
}

for (let i = 0; i < vertices.length; i += 3) {
  const x = vertices[i];
  const z = vertices[i + 1];
  
  // Calculate distance from center (0, 0) where the venue is
  const distanceFromCenter = Math.sqrt(x * x + z * z);
  
  // Define flat zone radius around venue (completely flat)
  const flatZoneRadius = 120; // 120 units flat around center
  
  let height;
  
  if (distanceFromCenter < flatZoneRadius) {
    // Completely flat around the venue at elevated height
    height = 7.45; // Raised ground level
  } else {
    // Ensure we normalize distance from flat zone to edge (0..1)
    const maxEffective = Math.max(1e-6, maxDistanceFromCenter - flatZoneRadius);
    const normalized = Math.min(1, Math.max(0, (distanceFromCenter - flatZoneRadius) / maxEffective));

    // Use an exponent > 1 so hills grow toward the edges (not toward the center)
    const edgeFactor = Math.pow(normalized, 0.3);

    // Rolling hills base (same frequencies as before)
    const baseHeight =
      Math.sin(x * 0.06) * 3 +
      Math.cos(z * 0.04) * 3 +
      Math.sin(x * 0.03) * 1.5 +
      Math.cos(z * 0.03) * 1.5;

    // Modulate amplitude by edgeFactor so terrain is low near the venue and larger toward edges
    const amplitude = 1 + edgeFactor * 6; // amplitude grows from ~1 to ~7 toward edges
    height = 7.45 + baseHeight * amplitude;

    // Add a smooth uplift toward the very edge so outer rim becomes mountainous
    height += edgeFactor * 8;

    // Clamp height to avoid extreme spikes
    height = Math.max(-50, Math.min(80, height));
  }
  
  vertices[i + 2] = height; // Set the Y (up) coordinate
  
  // Store in heightMap for lookup
  const gridX = Math.round((x + terrainSize / 2) / segmentSize);
  const gridZ = Math.round((z + terrainSize / 2) / segmentSize);
  heightMap[gridX][gridZ] = height;
}

terrainGeo.attributes.position.needsUpdate = true;
terrainGeo.computeVertexNormals(); // Recalculate normals for proper lighting

// Add vertex colors for snow effect based on height
const colors = [];
const SNOW_HEIGHT = 30; // Height where snow starts appearing
const SNOW_TRANSITION = 10; // Transition range for blending

for (let i = 0; i < vertices.length; i += 3) {
  const y = vertices[i + 2]; // Height value
  
  // Calculate snow factor (0 = no snow, 1 = full snow)
  let snowFactor = 0;
  if (y > SNOW_HEIGHT) {
    snowFactor = Math.min(1, (y - SNOW_HEIGHT) / SNOW_TRANSITION);
  }
  
  // Blend between grass color (dark olive green) and snow color (white)
  const grassColor = { r: 0x55 / 255, g: 0x6b / 255, b: 0x2f / 255 };
  const snowColor = { r: 1, g: 1, b: 1 };
  
  const r = grassColor.r * (1 - snowFactor) + snowColor.r * snowFactor;
  const g = grassColor.g * (1 - snowFactor) + snowColor.g * snowFactor;
  const b = grassColor.b * (1 - snowFactor) + snowColor.b * snowFactor;
  
  colors.push(r, g, b);
}

terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

// Create solid base terrain with vertex colors
const baseTerrainMat = new THREE.MeshStandardMaterial({ 
  vertexColors: true,
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
groundTexture.repeat.set(100, 100); // Repeat texture across terrain for better tiling on larger map
groundTexture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // Reduce flickering at distance
groundTexture.minFilter = THREE.LinearMipmapLinearFilter; // Better filtering for distant terrain
groundTexture.magFilter = THREE.LinearFilter;

// Create semi-transparent textured layer on top (grass texture with vertex colors for snow)
const terrainGeo2 = terrainGeo.clone();
const terrainMat = new THREE.MeshStandardMaterial({ 
  map: groundTexture,
  vertexColors: true, // Enable vertex colors to blend with texture
  transparent: true,
  opacity: 0.6, // Make texture semi-transparent
  flatShading: false,
  side: THREE.DoubleSide,
  depthWrite: false // Prevent z-fighting with base layer
});
const terrain = new THREE.Mesh(terrainGeo2, terrainMat);
terrain.rotation.x = -Math.PI / 2;
terrain.position.y = 0.05; // Increased separation to reduce z-fighting flickering
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
audioLoader.load('./assets/Vimmersvej.mp3', (buffer) => {
  themeSound.setBuffer(buffer);
  themeSound.setLoop(true);
  themeSound.setVolume(0.4);
});



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

// Load Boris Johnson sound as PositionalAudio
borisSound = new THREE.PositionalAudio(audioListener);
audioLoader.load('./assets/BorisJohnson.mp3', (buffer) => {
  borisSound.setBuffer(buffer);
  borisSound.setPlaybackRate(1.1);
  borisSound.setVolume(1.0);
  borisSound.setRefDistance(5); // Distance at which volume starts to decrease
  borisSound.setMaxDistance(20); // Maximum distance the sound can be heard
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
  
  const venueGroundHeight = 7.54;
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
      if (wireframeDebug) addWireframeDebug(node);
      
    }
  });
  
  scene.add(venueModel);
  console.log('Venue loaded with', venueMeshes.length, 'meshes for collision');
  
  // Create a clickable screenshot inside the venue
  const screenShotScale = 1.5;
  const screenshotTexture = textureLoader.load(MIKKEL_SCREENSHOT); // Placeholder texture
  const screenshotGeometry = new THREE.PlaneGeometry(10 * screenShotScale, 7 * screenShotScale); // Screen size
  const screenshotMaterial = new THREE.MeshStandardMaterial({ 
    map: screenshotTexture,
    side: THREE.DoubleSide,
    emissive: 0x222222,
    emissiveIntensity: 0.3
  });
  screenshotMesh = new THREE.Mesh(screenshotGeometry, screenshotMaterial);
  
  // Position screenshot inside the venue (adjust as needed)
  screenshotMesh.position.set(edgeX, venueGroundHeight + 7.5, edgeZ - 21);
  screenshotMesh.rotation.y = 0; // Face towards the entrance
  screenshotMesh.userData.isClickable = true;
  scene.add(screenshotMesh);
  
  console.log('Screenshot added to venue at:', screenshotMesh.position);
  
  // Helper function to create a canvas texture with text
  function createButtonTexture(text, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Background with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, bgColor);
    gradient.addColorStop(1, shadeColor(bgColor, -30));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Border
    ctx.strokeStyle = shadeColor(bgColor, 30);
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    
    // Text
    ctx.fillStyle = textColor;
    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
  
  // Helper function to darken/lighten colors
  function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }
  
  // Create interactive cinema buttons next to screenshot with improved design
  const buttonGeo = new THREE.BoxGeometry(2.5, 3.5, 0.3);
  
  // Left button (Mikkel - Blue) - position to the left of screenshot
  const leftButtonTexture = createButtonTexture('MIKKEL', '#4444ff', '#ffffff');
  const leftButtonMat = new THREE.MeshStandardMaterial({ 
    map: leftButtonTexture,
    color: 0xffffff,
    emissive: 0x2222ff,
    emissiveIntensity: 0.3,
    metalness: 0.5,
    roughness: 0.3
  });
  leftCinemaButton = new THREE.Mesh(buttonGeo, leftButtonMat);
  leftCinemaButton.position.set(edgeX - 9.5, venueGroundHeight + 7.5, edgeZ - 21);
  leftCinemaButton.rotation.y = 0;
  leftCinemaButton.userData.isButton = true;
  leftCinemaButton.userData.buttonType = 'mikkel';
  leftCinemaButton.castShadow = true;
  leftCinemaButton.receiveShadow = true;
  scene.add(leftCinemaButton);
  
  // Right button (Kristian - Red) - position to the right of screenshot
  const rightButtonTexture = createButtonTexture('KRISTIAN', '#ff4444', '#ffffff');
  const rightButtonMat = new THREE.MeshStandardMaterial({ 
    map: rightButtonTexture,
    color: 0xffffff,
    emissive: 0xff2222,
    emissiveIntensity: 0.3,
    metalness: 0.5,
    roughness: 0.3
  });
  rightCinemaButton = new THREE.Mesh(buttonGeo, rightButtonMat);
  rightCinemaButton.position.set(edgeX + 9.5, venueGroundHeight + 7.5, edgeZ - 21);
  rightCinemaButton.rotation.y = 0;
  rightCinemaButton.userData.isButton = true;
  rightCinemaButton.userData.buttonType = 'kristian';
  rightCinemaButton.castShadow = true;
  rightCinemaButton.receiveShadow = true;
  scene.add(rightCinemaButton);
  
  console.log('Cinema buttons added next to screenshot');
  
}, undefined, (err) => {
  console.error('Error loading venue:', err);
});

makeOcaml(3.7, 8.2, 18.2, 6);
makeOcaml(5.1, 8.2, 18.2, 6);
makeOcaml(6.5, 8.2, 18.2, 6);
makeOcaml(-2.9, 8.2, 18.2, 6);
makeOcaml(-2.9, 7.45, 100, 30);

// Load Boris Johnson inside the venue
loader.load('./assets/boris.glb', (borisGltf) => {
  borisModel = borisGltf.scene;
  
  // Scale Boris
  borisModel.scale.set(0.02, 0.02, 0.02);
  
  // Position Boris inside the venue (adjust coordinates as needed)
  const edgeX = 0;
  const edgeZ = 0;
  const venueGroundHeight = getTerrainHeight(edgeX, edgeZ);
  
  // Place Boris inside the venue (near the entrance or center)
  borisPosition.set(6.5, 6.8, 46.3);
  borisModel.position.copy(borisPosition);
  
  // Rotate Boris to face towards the entrance
  borisModel.rotation.x = Math.PI / 2; // Facing negative Z direction
  borisModel.rotation.z = Math.PI - 0.07; // Adjust as needed
  
  // Enable shadows
  borisModel.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  
  // Add the positional audio to Boris
  if (borisSound) {
    borisModel.add(borisSound);
  }
  
  // Setup animation if available
  if (borisGltf.animations && borisGltf.animations.length > 0) {
    borisMixer = new THREE.AnimationMixer(borisModel);
    borisAction = borisMixer.clipAction(borisGltf.animations[0]);
    borisAction.setLoop(THREE.LoopRepeat, Infinity);
    
    // Add event listener to restart sound every time animation loops
    borisMixer.addEventListener('loop', (e) => {
      if (borisSound && borisSound.buffer) {
        if (borisSound.isPlaying) {
          borisSound.stop();
        }
        borisSound.play();
        console.log('Boris sound restarted on animation loop');
      }
    });
    
    console.log('Boris Johnson animation loaded:', borisGltf.animations[0].name, 'Duration:', borisGltf.animations[0].duration);
  }
  
  scene.add(borisModel);
  console.log('Boris Johnson placed in venue at:', borisPosition);
}, undefined, (err) => {
  console.error('Error loading Boris Johnson:', err);
});

// Create cinema-style screen with iframe
// const iframe = document.createElement('iframe');
// iframe.src = 'https://bytes-theta-gets-interior.trycloudflare.com/';
// iframe.style.width = '1920px';
// iframe.style.height = '1080px';
// iframe.style.border = '0';
// iframe.style.pointerEvents = 'auto'; // Enable interaction with iframe

// const css3DObject = new CSS3DObject(iframe);
// css3DObject.position.set(50, 15, 50); // Position near spawn
// css3DObject.rotation.y = (Math.PI*1.2) ; // Angle towards spawn
// css3DObject.scale.set(0.02, 0.02, 0.02); // Scale down to reasonable size
// //scene.add(css3DObject);

// Cinema button variables
let leftCinemaButton = null;
let rightCinemaButton = null;
let currentCinemaImage = 'mikkel';

// Load textures for cinema screen switching
let mikkelTexture = null;
let kristianTexture = null;
let texturesLoaded = { mikkel: false, kristian: false };

textureLoader.load(MIKKEL_SCREENSHOT, 
  (texture) => {
    mikkelTexture = texture;
    texturesLoaded.mikkel = true;
    console.log('Mikkel texture loaded successfully');
  },
  undefined,
  (error) => {
    console.error('Error loading Mikkel texture:', error);
  }
);

textureLoader.load(KRISTIAN_SCREENSHOT, 
  (texture) => {
    kristianTexture = texture;
    texturesLoaded.kristian = true;
    console.log('Kristian texture loaded successfully');
  },
  undefined,
  (error) => {
    console.error('Error loading Kristian texture:', error);
  }
);

// Function to switch cinema image on the screenshot mesh
function switchCinemaImage(imageType) {
  if (!screenshotMesh) {
    console.log('Screenshot mesh not available yet');
    return;
  }
  
  if (imageType === 'mikkel' && currentCinemaImage !== 'mikkel') {
    if (!texturesLoaded.mikkel || !mikkelTexture) {
      console.log('Mikkel texture not loaded yet');
      return;
    }
    
    // Update the texture
    screenshotMesh.material.map = mikkelTexture;
    screenshotMesh.material.needsUpdate = true;
    currentCinemaImage = 'mikkel';
    console.log('Cinema: Switched to Mikkel');
    
    // Flash the button with scale animation
    if (leftCinemaButton) {
      leftCinemaButton.material.emissiveIntensity = 1.0;
      leftCinemaButton.scale.set(1.1, 1.1, 1.1);
      setTimeout(() => { 
        leftCinemaButton.material.emissiveIntensity = 0.3;
        leftCinemaButton.scale.set(1, 1, 1);
      }, 200);
    }
  } else if (imageType === 'kristian' && currentCinemaImage !== 'kristian') {
    if (!texturesLoaded.kristian || !kristianTexture) {
      console.log('Kristian texture not loaded yet');
      return;
    }
    
    // Update the texture
    screenshotMesh.material.map = kristianTexture;
    screenshotMesh.material.needsUpdate = true;
    currentCinemaImage = 'kristian';
    console.log('Cinema: Switched to Kristian');
    
    // Flash the button with scale animation
    if (rightCinemaButton) {
      rightCinemaButton.material.emissiveIntensity = 1.0;
      rightCinemaButton.scale.set(1.1, 1.1, 1.1);
      setTimeout(() => { 
        rightCinemaButton.material.emissiveIntensity = 0.3;
        rightCinemaButton.scale.set(1, 1, 1);
      }, 200);
    }
  }
}

// Function to show venue iframe
function showVenueIframe(url = "MIKKEL_APP") {
  if (!venueIframe) {
    // Create container for iframe with close button
    const iframeContainer = document.createElement('div');
    iframeContainer.id = 'venue-iframe-container';
    iframeContainer.style.position = 'fixed';
    iframeContainer.style.top = '0';
    iframeContainer.style.left = '0';
    iframeContainer.style.width = '100vw';
    iframeContainer.style.height = '100vh';
    iframeContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    iframeContainer.style.zIndex = '1000';
    iframeContainer.style.display = 'flex';
    iframeContainer.style.alignItems = 'center';
    iframeContainer.style.justifyContent = 'center';
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕ Close (ESC)';
    closeButton.style.position = 'absolute';
    closeButton.style.top = '20px';
    closeButton.style.right = '20px';
    closeButton.style.padding = '10px 20px';
    closeButton.style.fontSize = '16px';
    closeButton.style.backgroundColor = '#ff4444';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '4px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.zIndex = '1001';
    closeButton.onclick = hideVenueIframe;
    
    // Create iframe as a simple 2D overlay
    venueIframe = document.createElement('iframe');
    venueIframe.src = url;
    venueIframe.style.width = '80vw';
    venueIframe.style.height = '80vh';
    venueIframe.style.maxWidth = '1200px';
    venueIframe.style.maxHeight = '800px';
    venueIframe.style.border = '2px solid #333';
    venueIframe.style.borderRadius = '8px';
    venueIframe.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
    venueIframe.style.backgroundColor = '#000';
    
    iframeContainer.appendChild(closeButton);
    iframeContainer.appendChild(venueIframe);
    document.body.appendChild(iframeContainer);
    
    // Store reference to container
    venueIframe._container = iframeContainer;
  } else {
    // Show existing iframe and update URL
    venueIframe.src = url;
    venueIframe._container.style.display = 'flex';
    console.log('Updating iframe URL to:', url);
  }
  
  // Exit pointer lock to allow iframe interaction
  document.exitPointerLock();
  isVenueIframeVisible = true;
  
  console.log('Venue iframe displayed with URL:', url);
}

// Function to hide venue iframe
function hideVenueIframe() {
  if (venueIframe && isVenueIframeVisible) {
    venueIframe._container.style.display = 'none';
    isVenueIframeVisible = false;
    
    // Re-lock pointer
    renderer.domElement.requestPointerLock();
    
    console.log('Venue iframe hidden');
  }
}

// Function to update iframe position to follow camera (no longer needed - iframe is static)
function updateVenueIframePosition() {
  // Iframe now stays in place where it was opened
  // No continuous updates needed
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
  if (isPointerLocked) {
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = 0; // Center of screen in pointer lock
    mouse.y = 0;
    
    clickRaycaster.setFromCamera(mouse, camera);
    
    // Check for cinema button clicks
    if (leftCinemaButton && rightCinemaButton) {
      const buttonIntersects = clickRaycaster.intersectObjects([leftCinemaButton, rightCinemaButton]);
      if (buttonIntersects.length > 0) {
        const clickedButton = buttonIntersects[0].object;
        if (clickedButton.userData.buttonType) {
          switchCinemaImage(clickedButton.userData.buttonType);
          return;
        }
      }
    }
    
    // Check if clicking on screenshot
    if (screenshotMesh) {
      const intersects = clickRaycaster.intersectObject(screenshotMesh);
      if (intersects.length > 0) {
        // Clicked on screenshot - show iframe with URL based on current image
        const url = currentCinemaImage === 'kristian' ? KRISTIAN_APP : MIKKEL_APP;
        showVenueIframe(url);
        console.log('Opening iframe with:', url);
        return;
      }
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
    e.preventDefault();
    e.stopPropagation();
    hideVenueIframe();
    console.log('Escape pressed - closing iframe');
    return;
  }

  if (isVenueIframeVisible) return
  
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
  if (isVenueIframeVisible) return

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

// Additional escape key handler with capture to prevent iframe from consuming it
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && isVenueIframeVisible) {
    e.preventDefault();
    e.stopPropagation();
    hideVenueIframe();
    console.log('Window escape handler - closing iframe');
  }
}, true); // Use capture phase

// Mobile controls
const joystickContainer = document.getElementById('joystick-container');
const joystickStick = document.getElementById('joystick-stick');
const jumpButton = document.getElementById('jump-button');

let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };
let joystickDelta = { x: 0, y: 0 };

if (joystickContainer) {
  // Joystick touch handling
  joystickContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    const rect = joystickContainer.getBoundingClientRect();
    joystickCenter.x = rect.left + rect.width / 2;
    joystickCenter.y = rect.top + rect.height / 2;
  });

  document.addEventListener('touchmove', (e) => {
    if (!joystickActive) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - joystickCenter.x;
    const deltaY = touch.clientY - joystickCenter.y;
    
    const maxDistance = 35; // Maximum joystick travel distance
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance < maxDistance) {
      joystickDelta.x = deltaX / maxDistance;
      joystickDelta.y = deltaY / maxDistance;
      joystickStick.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
    } else {
      const angle = Math.atan2(deltaY, deltaX);
      const limitedX = Math.cos(angle) * maxDistance;
      const limitedY = Math.sin(angle) * maxDistance;
      joystickDelta.x = limitedX / maxDistance;
      joystickDelta.y = limitedY / maxDistance;
      joystickStick.style.transform = `translate(calc(-50% + ${limitedX}px), calc(-50% + ${limitedY}px))`;
    }
    
    // Update movement state based on joystick
    move.forward = -joystickDelta.y; // Inverted Y for forward/back
    move.right = -joystickDelta.x; // Inverted X for left/right
  });

  document.addEventListener('touchend', (e) => {
    if (!joystickActive) return;
    joystickActive = false;
    joystickDelta.x = 0;
    joystickDelta.y = 0;
    joystickStick.style.transform = 'translate(-50%, -50%)';
    
    // Reset movement
    move.forward = 0;
    move.right = 0;
  });
}

if (jumpButton) {
  jumpButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canJump) {
      velocity.y += 10;
      canJump = false;
      if (jumpingSound.buffer && !jumpingSound.isPlaying) {
        jumpingSound.play();
      }
    }
  });
}

// Mobile touch controls for camera rotation
let isTouchRotating = false;
let lastTouchX = 0;
let lastTouchY = 0;

document.addEventListener('touchstart', (e) => {
  // Only handle camera rotation if touching outside controls
  const touch = e.touches[0];
  const touchY = touch.clientY;
  
  // Check if touch is in upper 2/3 of screen (not on controls)
  if (touchY < window.innerHeight * 0.66) {
    isTouchRotating = true;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
  }
});

document.addEventListener('touchmove', (e) => {
  if (!isTouchRotating) return;
  
  const touch = e.touches[0];
  const deltaX = touch.clientX - lastTouchX;
  const deltaY = touch.clientY - lastTouchY;
  
  const sensitivity = 0.005;
  cameraYaw -= deltaX * sensitivity;
  cameraPitch -= deltaY * sensitivity;
  
  // Clamp pitch
  cameraPitch = Math.max(-Math.PI / 2 + 0.7, Math.min(Math.PI / 2 - 0.90, cameraPitch));
  
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
});

document.addEventListener('touchend', () => {
  isTouchRotating = false;
});

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
  if (ocamlMixers.length > 0) {
    ocamlMixers.forEach(mixer => mixer.update(delta));
  }
  if (borisMixer) {
    borisMixer.update(delta);
  }

  // Check proximity to Boris Johnson and play sound/animation
  if (borisModel && borisSound) {
    const distanceToBoris = character.position.distanceTo(borisPosition);
    const proximityThreshold = 10; // Distance at which Boris sound starts playing
    
    if (distanceToBoris < proximityThreshold) {
      // Start animation and sound together
      if (borisAction && !borisAction.isRunning()) {
        borisAction.play();
        console.log('Boris Johnson animation started!');
        
        // Start sound when animation starts
        if (borisSound.buffer && !borisSound.isPlaying) {
          borisSound.play();
          console.log('Boris Johnson sound started!');
        }
      }
    } else {
      // Stop sound
      if (borisSound.isPlaying) {
        borisSound.stop();
        console.log('Boris Johnson sound stopped!');
      }
      // Stop animation
      if (borisAction && borisAction.isRunning()) {
        borisAction.stop();
        console.log('Boris Johnson animation stopped!');
      }
    }
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
    const collidableMeshes = [...ocamlsMeshes, ...venueMeshes];
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
  const collidableMeshes = [...ocamlsMeshes, ...venueMeshes];
  
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
    
  }

  // Position camera based on yaw and pitch
  const distance = cameraOffset.z;
  const height = cameraOffset.y;
  
  const camX = character.position.x + Math.sin(cameraYaw) * distance * Math.cos(cameraPitch);
  const camZ = character.position.z + Math.cos(cameraYaw) * distance * Math.cos(cameraPitch);
  const camY = character.position.y + height + Math.sin(-cameraPitch) * distance;
  
  desiredCamPos = new THREE.Vector3(camX, camY, camZ);
  
  // Smooth camera movement
  if (!isVenueIframeVisible) {
    camera.position.lerp(desiredCamPos, 1 - Math.pow(0.01, delta));
    camera.lookAt(character.position.x, character.position.y + 2.5, character.position.z);
  }

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
themeSound.play();
animate();


function makeOcaml(x, y, z, size) {

    // Load OCaml at spawn position
    loader.load('./assets/OCamlHeadBop.glb', (ocamlGltf) => {
      ocamlModel = ocamlGltf.scene;

      let ocamlMeshes = [];
      
      // Scale OCaml to size
      ocamlModel.scale.set(size, size, size);
      
      // Position at spawn (0, 0) on the terrain;
      ocamlModel.position.set(x, y, z);

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
          if (wireframeDebug) addWireframeDebug(node);
        }
      });
      
      // Setup animation mixer for OCaml if animations exist
      if (ocamlGltf.animations && ocamlGltf.animations.length > 0) {
        ocamlMixers.push(new THREE.AnimationMixer(ocamlModel));
        const ocamlAction = ocamlMixers[ocamlMixers.length - 1].clipAction(ocamlGltf.animations[0]);
        ocamlAction.setLoop(THREE.LoopRepeat); // Make animation loop
        ocamlAction.play();
        console.log('OCaml animation activated with looping!');
      }
      
      scene.add(ocamlModel);


      console.log('OCaml placed at spawn position with', ocamlMeshes.length, 'meshes for collision');
    }, undefined, (err) => {
      console.error('Error loading OCaml:', err);
    });
}

function addWireframeDebug(node) {
  const wireframeGeometry = new THREE.WireframeGeometry(node.geometry);
  const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
  const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
  wireframe.position.copy(node.position);
  wireframe.rotation.copy(node.rotation);
  wireframe.scale.copy(node.scale);
  node.add(wireframe); // Attach to the mesh so it moves with it
}
