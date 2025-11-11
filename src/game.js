// Minimal Three.js game template (ES module)
// - Mohamed character controlled with WASD / arrows
// - Camera follows the character
// - Pointer lock for mouse-look
// - Animation blending (idle, walk, run)

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.0/build/index.module.js';
import { MultiplayerClient } from './multiplayer.js';
import { OptimizedTerrain } from './terrain.js';
import { MainMenu } from './mainMenu.js';

// Make THREE, GLTFLoader, DRACOLoader, MeshoptDecoder and SkeletonUtils globally available for multiplayer module
window.THREE = THREE;
window.GLTFLoader = GLTFLoader;
window.DRACOLoader = DRACOLoader;
window.MeshoptDecoder = MeshoptDecoder;
window.SkeletonUtils = SkeletonUtils;

const KRISTIAN_APP = "https://kruger-cuisine-martial-storage.trycloudflare.com/"
const KRISTIAN_SCREENSHOT = "./assets/kristianScreenshot.png"
const MIKKEL_APP = "https://au-rooms.omikkel.com"
const MIKKEL_SCREENSHOT = "./assets/mikkelScreenshot.jpg"
const wireframeDebug = false;
const ANTI_FLICKER_HEIGHT = 0.01; // Height offset to reduce z-fighting flickering

// Asset caching system using IndexedDB
class AssetCache {
  constructor() {
    this.dbName = 'GameAssetCache';
    this.dbVersion = 1;
    this.storeName = 'assets';
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('Asset cache initialized');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'url' });
        }
      };
    });
  }

  async get(url) {
    if (!this.db) return null;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(url);
      
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log('Loaded from cache:', url);
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  }

  async set(url, data) {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put({ url, data, timestamp: Date.now() });
      
      request.onsuccess = () => {
        console.log('Cached asset:', url);
        resolve();
      };
      request.onerror = () => resolve(); // Fail silently
    });
  }

  async clear() {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log('Asset cache cleared');
        resolve();
      };
      request.onerror = () => resolve();
    });
  }
}

// Initialize cache
const assetCache = new AssetCache();
await assetCache.init().catch(err => {
  console.warn('Failed to initialize asset cache:', err);
});

let ocamlMixers = [];
let ocamlsMeshes = [];

// Boris Johnson variables
let borisModel = null;
let borisSound = null;
let borisPosition = new THREE.Vector3();
let borisMixer = null;
let borisAction = null;

// Loading manager for tracking asset loading
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');

const loadingManager = new THREE.LoadingManager();

loadingManager.onStart = function(url, itemsLoaded, itemsTotal) {
  console.log('Started loading: ' + url);
};

loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
  const progress = (itemsLoaded / itemsTotal) * 100;
  loadingBar.style.width = progress + '%';
  loadingText.textContent = Math.round(progress) + '%';
  
  // Show what's currently loading
  const filename = url.split('/').pop();
  if (filename) {
    loadingText.textContent = `${Math.round(progress)}% - ${filename}`;
  }
};

loadingManager.onLoad = function() {
  console.log('Critical assets loaded! Starting game...');
  // Remove loading screen immediately for faster game start
  loadingScreen.classList.add('fade-out');
  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 300); // Reduced from 500ms
};

loadingManager.onError = function(url) {
  console.error('Error loading: ' + url);
};

// Add BVH functions to THREE.BufferGeometry
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const container = document.getElementById('canvas-container');

// Hide the game canvas initially (show when session starts)
container.style.display = 'none';

// Renderer with aggressive optimization
const renderer = new THREE.WebGLRenderer({ 
  antialias: window.devicePixelRatio <= 1, // Only antialias on low DPI screens
  alpha: false, // Disable alpha for performance
  logarithmicDepthBuffer: true,
  powerPreference: "high-performance", // Use high-performance GPU
  stencil: false // Disable stencil buffer
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // Faster than PCFSoftShadowMap
renderer.shadowMap.autoUpdate = true; // Keep shadows updating for animated characters
container.appendChild(renderer.domElement);

// CSS3D Renderer for iframe
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
cssRenderer.domElement.style.position = 'absolute';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.pointerEvents = 'none'; // Let pointer lock work
container.appendChild(cssRenderer.domElement);

// Scene & Camera with fog for distant culling
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 400, 800); // Add fog to hide distant LOD switches
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 850); // Reduced far plane

// Lighting
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
hemi.position.set(0, 200, 0);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(5, 10, 7.5);
dir.castShadow = true;
// Configure shadow properties - balanced quality and performance
dir.shadow.mapSize.width = 2048; // Higher resolution for better quality
dir.shadow.mapSize.height = 2048;
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 100;
dir.shadow.camera.left = -50;
dir.shadow.camera.right = 50;
dir.shadow.camera.top = 50;
dir.shadow.camera.bottom = -50;
dir.shadow.bias = -0.0001; // Prevent shadow acne
dir.shadow.radius = 2; // Slight blur to hide pixelation
scene.add(dir);

// Random Terrain Generation with LOD (Level of Detail)
const terrainSize = 1000;

// Function to generate terrain geometry at different detail levels
function generateTerrainGeometry(segments) {
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  const vertices = terrainGeo.attributes.position.array;
  const segmentSize = terrainSize / segments;
  const maxDistanceFromCenter = Math.sqrt((terrainSize/2) * (terrainSize/2) * 2);
  
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const z = vertices[i + 1];
    
    // Calculate distance from center (0, 0) where the venue is
    const distanceFromCenter = Math.sqrt(x * x + z * z);
    
    // Define flat zone radius around venue (completely flat)
    const flatZoneRadius = 120;
    
    let height;
    
    if (distanceFromCenter < flatZoneRadius) {
      height = 7.45;
    } else {
      const maxEffective = Math.max(1e-6, maxDistanceFromCenter - flatZoneRadius);
      const normalized = Math.min(1, Math.max(0, (distanceFromCenter - flatZoneRadius) / maxEffective));
      const edgeFactor = Math.pow(normalized, 1.8);
      
      const baseHeight =
        Math.sin(x * 0.06) * 3 +
        Math.cos(z * 0.04) * 3 +
        Math.sin(x * 0.03) * 1.5 +
        Math.cos(z * 0.03) * 1.5;
      
      const amplitude = 1 + edgeFactor * 15;
      let computedHeight = 7.45 + baseHeight * amplitude;
      computedHeight += Math.pow(edgeFactor, 2) * 40;
      computedHeight = Math.max(-50, Math.min(200, computedHeight));
      
      const blendDistance = 8;
      if (distanceFromCenter <= flatZoneRadius + blendDistance) {
        const t = Math.max(0, (distanceFromCenter - flatZoneRadius) / blendDistance);
        const s = t * t * (3 - 2 * t);
        height = 7.45 * (1 - s) + computedHeight * s;
      } else {
        height = computedHeight;
      }
    }
    
    vertices[i + 2] = height;
  }
  
  terrainGeo.attributes.position.needsUpdate = true;
  terrainGeo.computeVertexNormals();
  
  return terrainGeo;
}

// Generate LOD levels with more aggressive optimization
const terrainGeoHigh = generateTerrainGeometry(200);   // Reduced from 300 to 200
const terrainGeoMedium = generateTerrainGeometry(80);  // Reduced from 150 to 80
const terrainGeoLow = generateTerrainGeometry(30);     // Reduced from 75 to 30
const terrainGeoVeryLow = generateTerrainGeometry(15); // Extra low detail for very far terrain

// Store heightmap from highest detail version for collision detection
const terrainSegments = 200; // Match the high detail level
const vertices = terrainGeoHigh.attributes.position.array;
const heightMap = [];
const segmentSize = terrainSize / terrainSegments;
const maxDistanceFromCenter = Math.sqrt((terrainSize/2) * (terrainSize/2) * 2);

// Initialize heightMap
for (let i = 0; i <= terrainSegments; i++) {
  heightMap[i] = [];
}

// Populate heightMap from high detail geometry for collision detection
for (let i = 0; i < vertices.length; i += 3) {
  const x = vertices[i];
  const z = vertices[i + 1];
  const height = vertices[i + 2];
  
  // Store in heightMap for lookup
  const gridX = Math.round((x + terrainSize / 2) / segmentSize);
  const gridZ = Math.round((z + terrainSize / 2) / segmentSize);
  heightMap[gridX][gridZ] = height;
}

// Function to add vertex colors based on height (sand, grass, snow)
function applyTerrainColors(terrainGeo) {
  const colors = [];
  const vertices = terrainGeo.attributes.position.array;
  const SAND_MIN = -10;
  const SAND_MAX = 1;
  const SAND_TRANSITION = 2;
  const SNOW_HEIGHT = 30;
  const SNOW_TRANSITION = 10;
  
  for (let i = 0; i < vertices.length; i += 3) {
    const y = vertices[i + 2];
    
    const sandColor = { r: 0xc2 / 255, g: 0xb2 / 255, b: 0x80 / 255 };
    const grassColor = { r: 0x55 / 255, g: 0x6b / 255, b: 0x2f / 255 };
    const snowColor = { r: 1, g: 1, b: 1 };
    
    let r, g, b;
    
    if (y < SAND_MIN) {
      r = sandColor.r; g = sandColor.g; b = sandColor.b;
    } else if (y < SAND_MAX) {
      r = sandColor.r; g = sandColor.g; b = sandColor.b;
    } else if (y < SAND_MAX + SAND_TRANSITION) {
      const transitionFactor = (y - SAND_MAX) / SAND_TRANSITION;
      r = sandColor.r * (1 - transitionFactor) + grassColor.r * transitionFactor;
      g = sandColor.g * (1 - transitionFactor) + grassColor.g * transitionFactor;
      b = sandColor.b * (1 - transitionFactor) + grassColor.b * transitionFactor;
    } else if (y < SNOW_HEIGHT) {
      r = grassColor.r; g = grassColor.g; b = grassColor.b;
    } else if (y < SNOW_HEIGHT + SNOW_TRANSITION) {
      const snowFactor = (y - SNOW_HEIGHT) / SNOW_TRANSITION;
      r = grassColor.r * (1 - snowFactor) + snowColor.r * snowFactor;
      g = grassColor.g * (1 - snowFactor) + snowColor.g * snowFactor;
      b = grassColor.b * (1 - snowFactor) + snowColor.b * snowFactor;
    } else {
      r = snowColor.r; g = snowColor.g; b = snowColor.b;
    }
    
    colors.push(r, g, b);
  }
  
  terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

// Apply colors to all LOD levels
applyTerrainColors(terrainGeoHigh);
applyTerrainColors(terrainGeoMedium);
applyTerrainColors(terrainGeoLow);
applyTerrainColors(terrainGeoVeryLow);

// Create material for terrain with optimization
const baseTerrainMat = new THREE.MeshStandardMaterial({ 
  vertexColors: true,
  flatShading: false,
  side: THREE.FrontSide // Only render front side for performance
});

// Create LOD system for base terrain
const terrainLOD = new THREE.LOD();

const baseTerrainHigh = new THREE.Mesh(terrainGeoHigh, baseTerrainMat);
baseTerrainHigh.rotation.x = -Math.PI / 2;
baseTerrainHigh.receiveShadow = true;
baseTerrainHigh.castShadow = true;

const baseTerrainMedium = new THREE.Mesh(terrainGeoMedium, baseTerrainMat);
baseTerrainMedium.rotation.x = -Math.PI / 2;
baseTerrainMedium.receiveShadow = true;
baseTerrainMedium.castShadow = true;

const baseTerrainLow = new THREE.Mesh(terrainGeoLow, baseTerrainMat);
baseTerrainLow.rotation.x = -Math.PI / 2;
baseTerrainLow.receiveShadow = true;
baseTerrainLow.castShadow = false; // Disable shadows for far terrain

const baseTerrainVeryLow = new THREE.Mesh(terrainGeoVeryLow, baseTerrainMat);
baseTerrainVeryLow.rotation.x = -Math.PI / 2;
baseTerrainVeryLow.receiveShadow = false; // No shadows for very far terrain
baseTerrainVeryLow.castShadow = false;

// Add LOD levels: more aggressive distance-based switching
terrainLOD.addLevel(baseTerrainHigh, 0);     // 0-150 units: high detail
terrainLOD.addLevel(baseTerrainMedium, 150); // 150-300 units: medium detail
terrainLOD.addLevel(baseTerrainLow, 300);    // 300-500 units: low detail
terrainLOD.addLevel(baseTerrainVeryLow, 500); // 500+ units: very low detail

scene.add(terrainLOD);

// Create cached texture loader
class CachedTextureLoader extends THREE.TextureLoader {
  load(url, onLoad, onProgress, onError) {
    // Create a placeholder texture that will be returned immediately
    const texture = new THREE.Texture();
    
    assetCache.get(url).then(cachedData => {
      if (cachedData) {
        // Load from cache
        const blob = new Blob([cachedData], { type: 'image/png' });
        const objectURL = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
          texture.image = image;
          texture.needsUpdate = true;
          URL.revokeObjectURL(objectURL);
          if (onLoad) onLoad(texture);
          this.manager.itemEnd(url);
        };
        image.onerror = onError;
        image.src = objectURL;
        this.manager.itemStart(url);
      } else {
        // Load from network and cache
        const loader = new THREE.FileLoader(this.manager);
        loader.setResponseType('arraybuffer');
        loader.load(url, 
          (data) => {
            assetCache.set(url, data);
            const blob = new Blob([data], { type: 'image/png' });
            const objectURL = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
              texture.image = image;
              texture.needsUpdate = true;
              URL.revokeObjectURL(objectURL);
              if (onLoad) onLoad(texture);
            };
            image.onerror = onError;
            image.src = objectURL;
          },
          onProgress,
          onError
        );
      }
    }).catch(err => {
      // Fallback to normal loading
      console.warn('Cache error, loading normally:', err);
      const image = new Image();
      image.onload = () => {
        texture.image = image;
        texture.needsUpdate = true;
        if (onLoad) onLoad(texture);
        this.manager.itemEnd(url);
      };
      image.onerror = onError;
      image.src = url;
      this.manager.itemStart(url);
    });
    
    return texture;
  }
}

// Load ground texture for overlay
const textureLoader = new CachedTextureLoader(loadingManager);
const groundTexture = textureLoader.load('./assets/groundtexture.png');
groundTexture.wrapS = THREE.RepeatWrapping;
groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(75, 75); // Repeat texture across terrain for better tiling on larger map
groundTexture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // Reduce flickering at distance
groundTexture.minFilter = THREE.LinearMipmapLinearFilter; // Better filtering for distant terrain
groundTexture.magFilter = THREE.LinearFilter;

// Create semi-transparent textured layer on top (grass texture with vertex colors for snow)
// Use LOD for textured layer too with aggressive optimization
const terrainTextureMat = new THREE.MeshStandardMaterial({ 
  map: groundTexture,
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  flatShading: false,
  side: THREE.FrontSide, // Front side only for performance
  depthWrite: false
});

const terrainTextureLOD = new THREE.LOD();

const terrainHigh = new THREE.Mesh(terrainGeoHigh.clone(), terrainTextureMat);
terrainHigh.rotation.x = -Math.PI / 2;
terrainHigh.position.y = ANTI_FLICKER_HEIGHT;

const terrainMedium = new THREE.Mesh(terrainGeoMedium.clone(), terrainTextureMat);
terrainMedium.rotation.x = -Math.PI / 2;
terrainMedium.position.y = ANTI_FLICKER_HEIGHT;

const terrainLow = new THREE.Mesh(terrainGeoLow.clone(), terrainTextureMat);
terrainLow.rotation.x = -Math.PI / 2;
terrainLow.position.y = ANTI_FLICKER_HEIGHT;

const terrainVeryLow = new THREE.Mesh(terrainGeoVeryLow.clone(), terrainTextureMat);
terrainVeryLow.rotation.x = -Math.PI / 2;
terrainVeryLow.position.y = ANTI_FLICKER_HEIGHT;

// Match base terrain LOD distances
terrainTextureLOD.addLevel(terrainHigh, 0);
terrainTextureLOD.addLevel(terrainMedium, 150);
terrainTextureLOD.addLevel(terrainLow, 300);
terrainTextureLOD.addLevel(terrainVeryLow, 500);

scene.add(terrainTextureLOD);

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
let isPlayingSpecialAnimation = false; // Flag to prevent movement animations from interrupting special animations

// Global cache for Mohamed animations to share with remote players
window.mohamedAnimationCache = null;

// Audio setup
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

// Create cached audio loader
class CachedAudioLoader extends THREE.AudioLoader {
  load(url, onLoad, onProgress, onError) {
    assetCache.get(url).then(cachedData => {
      if (cachedData) {
        // Load from cache
        const audioContext = this.manager.resolveURL ? this.manager.resolveURL(url) : url;
        const context = THREE.AudioContext.getContext();
        context.decodeAudioData(cachedData, 
          (buffer) => {
            if (onLoad) onLoad(buffer);
          },
          onError
        );
      } else {
        // Load from network and cache
        const loader = new THREE.FileLoader(this.manager);
        loader.setResponseType('arraybuffer');
        loader.load(url,
          (data) => {
            assetCache.set(url, data);
            const context = THREE.AudioContext.getContext();
            context.decodeAudioData(data,
              (buffer) => {
                if (onLoad) onLoad(buffer);
              },
              onError
            );
          },
          onProgress,
          onError
        );
      }
    }).catch(err => {
      // Fallback to normal loading
      super.load(url, onLoad, onProgress, onError);
    });
  }
}

const audioLoader = new CachedAudioLoader();

const themeSound = new THREE.PositionalAudio(audioListener);

// Create audio objects for different states
const walkingSound = new THREE.Audio(audioListener);
const runningSound = new THREE.Audio(audioListener);
const swimmingSound = new THREE.Audio(audioListener);
const jumpingSound = new THREE.Audio(audioListener);

// Load sounds
audioLoader.load('./assets/Vimmersvej.mp3', (buffer) => {
  themeSound.setBuffer(buffer);
  themeSound.setLoop(true);
  themeSound.setVolume(0.1);
  themeSound.setRefDistance(15); // Full volume within 15 units
  themeSound.setMaxDistance(50); // Fade out at 50 units
  themeSound.setRolloffFactor(2.0); // Very aggressive volume falloff
  themeSound.setDistanceModel('exponential'); // Exponential falloff for dramatic distance effect
});



audioLoader.load('./assets/walking_elephant.m4a', (buffer) => {
  walkingSound.setBuffer(buffer);
  walkingSound.setLoop(true);
  walkingSound.setVolume(1);
  walkingSound.playbackRate = 1.15;
});

audioLoader.load('/assets/running_elephant.m4a', (buffer) => {
  runningSound.setBuffer(buffer);
  runningSound.setLoop(true);
  runningSound.setVolume(1);
  runningSound.playbackRate = 1.25;
});

audioLoader.load('./assets/swimming_elephant.m4a', (buffer) => {
  swimmingSound.setBuffer(buffer);
  swimmingSound.setLoop(true);
  swimmingSound.setVolume(1);
  swimmingSound.playbackRate = 1.5;
});

audioLoader.load('./assets/jumping_elephant.wav', (buffer) => {
  jumpingSound.setBuffer(buffer);
  jumpingSound.setLoop(false);
  jumpingSound.setVolume(0.1);
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

// Create cached GLTF loader
class CachedGLTFLoader extends GLTFLoader {
  load(url, onLoad, onProgress, onError) {
    assetCache.get(url).then(cachedData => {
      if (cachedData) {
        // Load from cache
        const blob = new Blob([cachedData], { type: 'model/gltf-binary' });
        const objectURL = URL.createObjectURL(blob);
        super.load(objectURL,
          (gltf) => {
            URL.revokeObjectURL(objectURL);
            if (onLoad) onLoad(gltf);
          },
          onProgress,
          onError
        );
      } else {
        // Load from network and cache
        const fileLoader = new THREE.FileLoader(this.manager);
        fileLoader.setResponseType('arraybuffer');
        fileLoader.load(url,
          (data) => {
            assetCache.set(url, data);
            const blob = new Blob([data], { type: 'model/gltf-binary' });
            const objectURL = URL.createObjectURL(blob);
            super.load(objectURL,
              (gltf) => {
                URL.revokeObjectURL(objectURL);
                if (onLoad) onLoad(gltf);
              },
              onProgress,
              onError
            );
          },
          onProgress,
          onError
        );
      }
    }).catch(err => {
      // Fallback to normal loading
      super.load(url, onLoad, onProgress, onError);
    });
  }
}

// Setup DRACO loader for compressed models
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.setDecoderConfig({ type: 'js' });

const loader = new CachedGLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.setMeshoptDecoder(MeshoptDecoder);

// Create a separate loader for background assets (not tracked by loading manager)
const backgroundLoader = new CachedGLTFLoader(new THREE.LoadingManager());
backgroundLoader.setDRACOLoader(dracoLoader);
backgroundLoader.setMeshoptDecoder(MeshoptDecoder);

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
  }),
  new Promise((resolve, reject) => {
    loader.load('./assets/mohamed/Animation_Agree_Gesture_withSkin.glb', resolve, undefined, reject);
  }),
  new Promise((resolve, reject) => {
    loader.load('./assets/mohamed/Animation_All_Night_Dance_withSkin.glb', resolve, undefined, reject);
  }),
  new Promise((resolve, reject) => {
    loader.load('./assets/mohamed/Animation_Boom_Dance_withSkin.glb', resolve, undefined, reject);
  }),
  new Promise((resolve, reject) => {
    loader.load('./assets/mohamed/Animation_Boxing_Practice_withSkin.glb', resolve, undefined, reject);
  }),
  new Promise((resolve, reject) => {
    loader.load('./assets/mohamed/Animation_Dead_withSkin.glb', resolve, undefined, reject);
  }),
  new Promise((resolve, reject) => {
    loader.load('./assets/mohamed/Animation_Skill_01_withSkin.glb', resolve, undefined, reject);
  })
]).then(([characterGltf, idleGltf, walkGltf, runGltf, swimGltf, agreeGltf, danceGltf, boomGltf, boxingGltf, deadGltf, skillGltf]) => {
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
  
  // Special animations - set to play once (not loop)
  animations.agree = mixer.clipAction(agreeGltf.animations[0]);
  animations.agree.setLoop(THREE.LoopOnce, 1);
  animations.agree.clampWhenFinished = true;
  
  animations.dance = mixer.clipAction(danceGltf.animations[0]);
  animations.dance.setLoop(THREE.LoopOnce, 1);
  animations.dance.clampWhenFinished = true;
  
  animations.boom = mixer.clipAction(boomGltf.animations[0]);
  animations.boom.setLoop(THREE.LoopOnce, 1);
  animations.boom.clampWhenFinished = true;
  
  animations.boxing = mixer.clipAction(boxingGltf.animations[0]);
  animations.boxing.setLoop(THREE.LoopOnce, 1);
  animations.boxing.clampWhenFinished = true;
  
  animations.dead = mixer.clipAction(deadGltf.animations[0]);
  animations.dead.setLoop(THREE.LoopOnce, 1);
  animations.dead.clampWhenFinished = true;
  
  animations.skill = mixer.clipAction(skillGltf.animations[0]);
  animations.skill.setLoop(THREE.LoopOnce, 1);
  animations.skill.clampWhenFinished = true;
  
  // Start with idle
  animations.idle.play();
  currentAction = animations.idle;
  
  // Cache the loaded GLTF animations globally for remote players to reuse
  window.mohamedAnimationCache = {
    character: characterGltf,
    idle: idleGltf,
    walk: walkGltf,
    run: runGltf,
    swim: swimGltf,
    agree: agreeGltf,
    dance: danceGltf,
    boom: boomGltf,
    boxing: boxingGltf,
    dead: deadGltf,
    skill: skillGltf
  };
  
  // Update multiplayer client with Mohamed model for rotation sync
  if (multiplayerClient) {
    multiplayerClient.setMohamedModel(mohamedModel);
  }
  
  console.log('Mohamed loaded with animations and cached for remote players!');
}).catch(err => {
  console.error('Error loading Mohamed:', err);
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    name: err.name
  });
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
let castleMeshes = [];

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
  
  const venueGroundHeight = getTerrainHeight(edgeX, edgeZ)+ANTI_FLICKER_HEIGHT+0.05; // Slightly above terrain to avoid z-fighting
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
  
  // Attach theme music to venue so it's spatially positioned at the stage
  if (themeSound) {
    venueModel.add(themeSound);
    console.log('Theme music positioned at venue');
  }
  
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

// Function to optimize model materials and rendering (no geometry decimation)
function optimizeModel(model) {
  let totalVertices = 0;
  let meshCount = 0;
  
  model.traverse((node) => {
    if (node.isMesh) {
      meshCount++;
      
      // Count vertices before optimization
      if (node.geometry.attributes.position) {
        totalVertices += node.geometry.attributes.position.count;
      }
      
      // Optimize material for performance without breaking shadows or textures
      if (node.material) {
        // Clone material to avoid affecting other instances
        node.material = node.material.clone();
        
        // Optimize material settings for performance
        node.material.flatShading = false;
        
        // Disable features that aren't needed for better performance
        if (node.material.map) {
          // Ensure texture is using mipmaps efficiently
          node.material.map.generateMipmaps = true;
        }
        
        // Keep shadows working properly
        node.material.shadowSide = THREE.FrontSide;
        
        // Force material to update
        node.material.needsUpdate = true;
      }
      
      // Optimize geometry without changing topology
      const geometry = node.geometry;
      if (geometry) {
        // Ensure normals are computed for proper shading
        if (!geometry.attributes.normal) {
          geometry.computeVertexNormals();
        }
        
        // Remove unused attributes to save memory
        if (geometry.attributes.tangent) {
          delete geometry.attributes.tangent;
        }
      }
    }
  });
  
  console.log(`Optimized model: ${meshCount} meshes, ${totalVertices} vertices total`);
}

// Load Boris Johnson inside the venue (background loading - doesn't block game start)
backgroundLoader.load('./assets/boris.glb', (borisGltf) => {
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
  
  // Optimize model for performance (materials and memory)
  optimizeModel(borisModel);
  
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

// Load Castle of Loarre in the background (background loading - doesn't block game start)
backgroundLoader.load('./assets/castle_of_loarre.glb', (gltf) => {
  const castleModel = gltf.scene;
  
  // Scale the castle appropriately
  castleModel.scale.set(1, 1, 1);
  
  // Position castle in the distance (far from spawn area)
  castleModel.position.set(300, 7.45, 300);
  
  // Enable shadows
  castleModel.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      castleMeshes.push(node);
    }
  });
  
  scene.add(castleModel);
  console.log('Castle of Loarre placed in background at:', castleModel.position);
}, undefined, (err) => {
  console.error('Error loading Castle of Loarre:', err);
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
    iframeContainer.style.zIndex = '9999';
    iframeContainer.style.display = 'flex';
    iframeContainer.style.alignItems = 'center';
    iframeContainer.style.justifyContent = 'center';
    iframeContainer.style.overflow = 'hidden';
    
    // Create close button - mobile-friendly design
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.id = 'close-iframe-button';
    closeButton.style.position = 'fixed';
    closeButton.style.top = '15px';
    closeButton.style.right = '15px';
    closeButton.style.width = '50px';
    closeButton.style.height = '50px';
    closeButton.style.padding = '0';
    closeButton.style.fontSize = '32px';
    closeButton.style.fontWeight = 'bold';
    closeButton.style.lineHeight = '50px';
    closeButton.style.textAlign = 'center';
    closeButton.style.backgroundColor = 'rgba(255, 68, 68, 0.95)';
    closeButton.style.color = 'white';
    closeButton.style.border = '2px solid white';
    closeButton.style.borderRadius = '50%';
    closeButton.style.cursor = 'pointer';
    closeButton.style.zIndex = '999999';
    closeButton.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.5)';
    closeButton.style.display = 'flex';
    closeButton.style.alignItems = 'center';
    closeButton.style.justifyContent = 'center';
    closeButton.style.touchAction = 'manipulation';
    closeButton.style.webkitTapHighlightColor = 'transparent';
    closeButton.style.userSelect = 'none';
    closeButton.style.webkitUserSelect = 'none';
    closeButton.style.pointerEvents = 'auto';
    closeButton.style.transition = 'transform 0.1s ease, background-color 0.2s ease';
    
    // Add hover/active effects
    closeButton.onmouseenter = () => {
      closeButton.style.transform = 'scale(1.1)';
      closeButton.style.backgroundColor = 'rgba(255, 0, 0, 1)';
    };
    closeButton.onmouseleave = () => {
      closeButton.style.transform = 'scale(1)';
      closeButton.style.backgroundColor = 'rgba(255, 68, 68, 0.95)';
    };
    
    // Add multiple event handlers with better event handling
    const closeHandler = (e) => {
      console.log('Close button event triggered:', e.type);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      hideVenueIframe();
      return false;
    };
    
    closeButton.addEventListener('touchstart', closeHandler, { passive: false, capture: true });
    closeButton.addEventListener('touchend', closeHandler, { passive: false, capture: true });
    closeButton.addEventListener('click', closeHandler, { capture: true });
    closeButton.addEventListener('mousedown', closeHandler, { capture: true });
    
    // Create iframe wrapper to control sizing better
    const iframeWrapper = document.createElement('div');
    iframeWrapper.style.position = 'relative';
    iframeWrapper.style.width = '90vw';
    iframeWrapper.style.height = '70vh';
    iframeWrapper.style.maxWidth = '1000px';
    iframeWrapper.style.maxHeight = '700px';
    iframeWrapper.style.margin = '20px';
    
    // Create iframe as a simple 2D overlay
    venueIframe = document.createElement('iframe');
    venueIframe.src = url;
    venueIframe.style.width = '100%';
    venueIframe.style.height = '100%';
    venueIframe.style.border = '2px solid #333';
    venueIframe.style.borderRadius = '8px';
    venueIframe.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
    venueIframe.style.backgroundColor = '#000';
    venueIframe.style.display = 'block';
    
    iframeWrapper.appendChild(venueIframe);
    iframeContainer.appendChild(iframeWrapper);
    document.body.appendChild(iframeContainer);
    document.body.appendChild(closeButton); // Append close button directly to body for highest priority
    
    // Store references
    venueIframe._container = iframeContainer;
    venueIframe._closeButton = closeButton;
  } else {
    // Show existing iframe and update URL
    venueIframe.src = url;
    venueIframe._container.style.display = 'flex';
    if (venueIframe._closeButton) {
      venueIframe._closeButton.style.display = 'flex';
    }
    console.log('Updating iframe URL to:', url);
  }
  
  // Set flag FIRST before any other actions
  isVenueIframeVisible = true;
  
  // Exit pointer lock to allow iframe interaction
  document.exitPointerLock();
  
  console.log('Venue iframe displayed. isVenueIframeVisible =', isVenueIframeVisible);
}

// Function to hide venue iframe
function hideVenueIframe() {
  console.log('hideVenueIframe called. isVenueIframeVisible =', isVenueIframeVisible);
  
  if (venueIframe && isVenueIframeVisible) {
    venueIframe._container.style.display = 'none';
    if (venueIframe._closeButton) {
      venueIframe._closeButton.style.display = 'none';
    }
    isVenueIframeVisible = false;
    
    // Only try to re-lock pointer on desktop (not mobile) and if game has started
    if (!('ontouchstart' in window) && gameStarted) {
      renderer.domElement.requestPointerLock();
    }
    
    console.log('Venue iframe hidden. isVenueIframeVisible now =', isVenueIframeVisible);
  } else {
    console.log('hideVenueIframe: conditions not met. venueIframe exists:', !!venueIframe);
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

// Request pointer lock on click (only when game has started)
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
  
  // Only request pointer lock if the game has started
  if (gameStarted) {
    renderer.domElement.requestPointerLock();
  }
});

// Track pointer lock state
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
  
  // Start theme music on first pointer lock (user interaction)
  if (isPointerLocked && themeSound.buffer && !themeSound.isPlaying) {
    themeSound.play();
    console.log('Theme music started!');
  }
  
  if (!isPointerLocked && isCinemaMode) {
    // Exited pointer lock while in cinema mode - exit cinema mode
    isCinemaMode = false;
    cssRenderer.domElement.style.pointerEvents = 'none';
  }
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
  // Check for Escape key to close venue iframe or return to menu
  if (e.code === 'Escape') {
    if (isVenueIframeVisible) {
      e.preventDefault();
      e.stopPropagation();
      hideVenueIframe();
      console.log('Escape pressed - closing iframe');
      return;
    } else if (gameStarted) {
      // Return to main menu
      e.preventDefault();
      e.stopPropagation();
      if (confirm('Return to main menu? (You will leave the current session)')) {
        location.reload();
      }
      return;
    }
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
        console.log('Cinema mode enabled - cursor active');
      } else {
        // Re-lock pointer and disable cinema interaction
        isCinemaMode = false;
        cssRenderer.domElement.style.pointerEvents = 'none';
        if (gameStarted) {
          renderer.domElement.requestPointerLock();
        }
        console.log('Cinema mode disabled - pointer locked');
      }
      break;
    case 'KeyF':
      // Agree gesture animation
      if (animations.agree) {
        fadeToAction(animations.agree, 0.3, true);
        if (multiplayerClient) {
          multiplayerClient.triggerSound('agree');
        }
      }
      break;
    case 'KeyG':
      // All night dance animation
      if (animations.dance) {
        fadeToAction(animations.dance, 0.3, true);
        if (multiplayerClient) {
          multiplayerClient.triggerSound('dance');
        }
      }
      break;
    case 'KeyH':
      // Boom dance animation
      if (animations.boom) {
        fadeToAction(animations.boom, 0.3, true);
        if (multiplayerClient) {
          multiplayerClient.triggerSound('boom');
        }
      }
      break;
    case 'KeyJ':
      // Boxing practice animation
      if (animations.boxing) {
        fadeToAction(animations.boxing, 0.3, true);
        if (multiplayerClient) {
          multiplayerClient.triggerSound('boxing');
        }
      }
      break;
    case 'KeyK':
      // Dead animation
      if (animations.dead) {
        fadeToAction(animations.dead, 0.3, true);
        if (multiplayerClient) {
          multiplayerClient.triggerSound('dead');
        }
      }
      break;
    case 'KeyL':
      // Skill animation
      if (animations.skill) {
        fadeToAction(animations.skill, 0.3, true);
        if (multiplayerClient) {
          multiplayerClient.triggerSound('skill');
        }
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
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let lastTouchX = 0;
let lastTouchY = 0;
let hasDragged = false;

document.addEventListener('touchstart', (e) => {
  // Don't handle game touches when iframe is open
  if (isVenueIframeVisible) {
    console.log('touchstart blocked - iframe is visible');
    return;
  }
  
  // Only handle camera rotation if touching outside controls
  const touch = e.touches[0];
  const touchX = touch.clientX;
  const touchY = touch.clientY;
  
  // Check if touch is in upper 2/3 of screen (not on controls)
  if (touchY < window.innerHeight * 0.66) {
    e.preventDefault(); // Prevent page scrolling
    isTouchRotating = true;
    touchStartX = touchX;
    touchStartY = touchY;
    touchStartTime = Date.now();
    lastTouchX = touchX;
    lastTouchY = touchY;
    hasDragged = false;
    console.log('Camera rotation started');
  }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  // Don't handle game touches when iframe is open
  if (isVenueIframeVisible) {
    console.log('touchmove blocked - iframe is visible');
    return;
  }
  if (!isTouchRotating) return;
  
  // Prevent page scrolling
  e.preventDefault();
  
  const touch = e.touches[0];
  const deltaX = touch.clientX - lastTouchX;
  const deltaY = touch.clientY - lastTouchY;
  
  // Check if user has dragged enough to be considered camera rotation (not a tap)
  const totalDragDistance = Math.sqrt(
    Math.pow(touch.clientX - touchStartX, 2) + 
    Math.pow(touch.clientY - touchStartY, 2)
  );
  
  if (totalDragDistance > 10) { // Threshold for distinguishing tap from drag
    hasDragged = true;
  }
  
  const sensitivity = 0.005;
  cameraYaw -= deltaX * sensitivity;
  cameraPitch -= deltaY * sensitivity;
  
  // Clamp pitch
  cameraPitch = Math.max(-Math.PI / 2 + 0.7, Math.min(Math.PI / 2 - 0.90, cameraPitch));
  
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;
}, { passive: false });

document.addEventListener('touchend', (e) => {
  // Don't handle game touches when iframe is open
  if (isVenueIframeVisible) {
    console.log('touchend blocked - iframe is visible');
    return;
  }
  
  // Only process tap if we were tracking a touch
  if (!isTouchRotating) return;
  
  // Check if this was a tap (not dragged and quick)
  const touchDuration = Date.now() - touchStartTime;
  const wasTap = !hasDragged && touchDuration < 300; // Less than 300ms = tap
  
  if (wasTap && e.changedTouches && e.changedTouches.length > 0) {
    const touch = e.changedTouches[0];
    
    console.log('Tap detected at:', touch.clientX, touch.clientY);
    
    // Convert touch coordinates to normalized device coordinates
    mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
    
    clickRaycaster.setFromCamera(mouse, camera);
    
    // Check for cinema button clicks
    if (leftCinemaButton && rightCinemaButton) {
      const buttonIntersects = clickRaycaster.intersectObjects([leftCinemaButton, rightCinemaButton]);
      if (buttonIntersects.length > 0) {
        const clickedButton = buttonIntersects[0].object;
        if (clickedButton.userData.buttonType) {
          console.log('Cinema button tapped:', clickedButton.userData.buttonType);
          switchCinemaImage(clickedButton.userData.buttonType);
          isTouchRotating = false;
          hasDragged = false;
          return;
        }
      }
    }
    
    // Check if tapping on screenshot
    if (screenshotMesh) {
      const intersects = clickRaycaster.intersectObject(screenshotMesh);
      if (intersects.length > 0) {
        console.log('Screenshot tapped! Opening iframe...');
        // Tapped on screenshot - show iframe with URL based on current image
        const url = currentCinemaImage === 'kristian' ? KRISTIAN_APP : MIKKEL_APP;
        showVenueIframe(url);
        isTouchRotating = false;
        hasDragged = false;
        return;
      } else {
        console.log('No intersection with screenshot');
      }
    }
  }
  
  // Reset state
  isTouchRotating = false;
  hasDragged = false;
});

// Camera follow offset
const cameraOffset = new THREE.Vector3(0, 4, 6);

// Clock
const clock = new THREE.Clock();

// Helper to smoothly transition between animations
function fadeToAction(newAction, duration = 0.3, isSpecial = false) {
  if (currentAction && currentAction !== newAction) {
    currentAction.fadeOut(duration);
  }
  newAction.reset().fadeIn(duration).play();
  currentAction = newAction;
  
  // If this is a special animation, set the flag and clear it when animation finishes
  if (isSpecial) {
    isPlayingSpecialAnimation = true;
    
    // Listen for animation to finish (not loop)
    const onFinished = () => {
      isPlayingSpecialAnimation = false;
      mixer.removeEventListener('finished', onFinished);
    };
    mixer.addEventListener('finished', onFinished);
  }
}

let desiredCamPos = null

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());

  // Update LOD based on camera position
  terrainLOD.update(camera);
  terrainTextureLOD.update(camera);

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
    const collidableMeshes = [...ocamlsMeshes, ...venueMeshes, ...castleMeshes];
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
  const collidableMeshes = [...ocamlsMeshes, ...venueMeshes, ...castleMeshes];
  
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
    
    // Swimming animation (only if not playing special animation)
    if (!isPlayingSpecialAnimation) {
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
    
    // Animation blending based on speed (on land) - only if not playing special animation
    if (!isPlayingSpecialAnimation) {
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

  // Update multiplayer
  if (multiplayerClient) {
    multiplayerClient.update(delta);
    
    // Update current animation state for multiplayer
    if (currentAction) {
      if (currentAction === animations.idle) {
        currentAnimationState = 'idle';
      } else if (currentAction === animations.walk) {
        currentAnimationState = 'walk';
      } else if (currentAction === animations.run) {
        currentAnimationState = 'run';
      } else if (currentAction === animations.swim) {
        currentAnimationState = 'swim';
      } else if (currentAction === animations.agree) {
        currentAnimationState = 'agree';
      } else if (currentAction === animations.dance) {
        currentAnimationState = 'dance';
      } else if (currentAction === animations.boom) {
        currentAnimationState = 'boom';
      } else if (currentAction === animations.boxing) {
        currentAnimationState = 'boxing';
      } else if (currentAction === animations.dead) {
        currentAnimationState = 'dead';
      } else if (currentAction === animations.skill) {
        currentAnimationState = 'skill';
      }
      multiplayerClient.setCurrentAnimation(currentAnimationState);
    }
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

// Initialize multiplayer client
let multiplayerClient = null;
let currentAnimationState = 'idle';
let gameStarted = false; // Flag to prevent pointer lock until game starts

// Function to start the game with a session ID and username
function startGameWithSession(sessionId, username) {
  console.log('Starting game with session ID:', sessionId, 'username:', username);
  
  // Enable pointer lock and show the game canvas
  gameStarted = true;
  container.style.display = 'block';
  
  // Validate and sanitize username
  if (!username || !username.trim()) {
    username = 'Player' + Math.floor(Math.random() * 1000);
    console.log('No username provided, generated random username:', username);
  } else {
    username = username.trim().substring(0, 20); // Limit to 20 chars
    localStorage.setItem('gameUsername', username);
    console.log('Using username:', username);
  }

  try {
    console.log('Creating MultiplayerClient with username:', username, 'and session:', sessionId);
    multiplayerClient = new MultiplayerClient(scene, camera, character, username, mohamedModel, sessionId);
    console.log('Multiplayer MMO client initialized with username:', username);
    
    // Add player count display (bottom left)
    const playerCountEl = document.createElement('div');
    playerCountEl.id = 'player-count';
    playerCountEl.style.position = 'fixed';
    playerCountEl.style.bottom = '10px';
    playerCountEl.style.left = '10px';
    playerCountEl.style.padding = '10px';
    playerCountEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    playerCountEl.style.color = 'white';
    playerCountEl.style.fontFamily = 'Arial, sans-serif';
    playerCountEl.style.fontSize = '14px';
    playerCountEl.style.borderRadius = '5px';
    playerCountEl.style.zIndex = '1000';
    playerCountEl.textContent = 'Players: 1';
    document.body.appendChild(playerCountEl);
    
    // Update player count every second
    setInterval(() => {
      if (multiplayerClient) {
        playerCountEl.textContent = `Players: ${multiplayerClient.getPlayerCount()}`;
      }
    }, 1000);
  } catch (error) {
    console.error('Failed to initialize multiplayer:', error);
    console.log('Running in single-player mode');
  }

  // Start animation loop (theme music will start on first user click)
  animate();
}

// Initialize main menu instead of starting game directly
console.log('Initializing main menu...');
const mainMenu = new MainMenu(startGameWithSession);
window.mainMenu = mainMenu; // Expose to window for onclick handlers
console.log('Main menu initialized, waiting for user to select/create session');


function makeOcaml(x, y, z, size) {

    // Load OCaml at spawn position
    loader.load('./assets/OCamlHeadBop.glb', (ocamlGltf) => {
      ocamlModel = ocamlGltf.scene;
      
      // Scale OCaml to size
      ocamlModel.scale.set(size, size, size);
      
      // Position at spawn (0, 0) on the terrain;
      ocamlModel.position.set(x, y, z);

      // Rotate him 180 degrees to face the camera
      ocamlModel.rotation.y = Math.PI;  
      
      // Optimize model for performance (materials and memory)
      optimizeModel(ocamlModel);
      
      // Build BVH for OCaml meshes and enable shadows
      ocamlModel.traverse((node) => {
        if (node.isMesh) {
          // Compute BVH for accurate collision
          node.geometry.computeBoundsTree();
          // Add to global collision array
          ocamlsMeshes.push(node);
          
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

      console.log('OCaml placed at position with meshes added to global collision array');
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
