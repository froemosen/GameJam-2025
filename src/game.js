// Minimal Three.js game template (ES module)
// - Mohamed character controlled with WASD / arrows
// - Camera follows the character
// - Pointer lock for mouse-look
// - Animation blending (idle, walk, run)

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.getElementById('canvas-container');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

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
scene.add(dir);

// Ground
const groundGeo = new THREE.PlaneGeometry(10000, 10000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x556b2f });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Character placeholder (will be replaced with Mohamed model)
const character = new THREE.Object3D();
character.position.set(0, 0, 0);
scene.add(character);

// Mohamed model and animations
let mohamedModel = null;
let mixer = null;
let animations = {};
let currentAction = null;

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
  })
]).then(([characterGltf, idleGltf, walkGltf, runGltf]) => {
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

// Helpful visual: grid and axis
const grid = new THREE.GridHelper(100, 100, 0x444444, 0x444444);
scene.add(grid);

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

// Camera rotation state
let cameraYaw = 0; // Horizontal rotation (left-right)
let cameraPitch = 0.3; // Vertical rotation (up-down), start slightly looking down
let isPointerLocked = false;

// Request pointer lock on click
document.addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
});

// Track pointer lock state
document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
});

// Mouse movement for camera rotation
document.addEventListener('mousemove', (e) => {
  if (!isPointerLocked) return;
  
  const sensitivity = 0.002;
  cameraYaw -= e.movementX * sensitivity;
  cameraPitch -= e.movementY * sensitivity;
  
  // Clamp pitch to prevent camera flipping
  cameraPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraPitch));
});

// Movement state
const move = { forward: 0, right: 0, up: 0 };
let canJump = true;
let velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

function onKeyDown(e) {
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW': move.forward = 1; break;
    case 'ArrowLeft':
    case 'KeyA': move.right = -1; break;
    case 'ArrowDown':
    case 'KeyS': move.forward = -1; break;
    case 'ArrowRight':
    case 'KeyD': move.right = 1; break;
    case 'Space':
      if (canJump) { velocity.y = 7; canJump = false; }
      break;
  }
}
function onKeyUp(e) {
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW': if (move.forward === 1) move.forward = 0; break;
    case 'ArrowLeft':
    case 'KeyA': if (move.right === -1) move.right = 0; break;
    case 'ArrowDown':
    case 'KeyS': if (move.forward === -1) move.forward = 0; break;
    case 'ArrowRight':
    case 'KeyD': if (move.right === 1) move.right = 0; break;
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

  // Update animation mixer
  if (mixer) {
    mixer.update(delta);
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
    const isRunning = move.forward > 0; // Run when moving forward
    speed = isRunning ? runSpeed : walkSpeed;
    
    // Calculate movement direction relative to camera yaw
    const cos = Math.cos(cameraYaw);
    const sin = Math.sin(cameraYaw);
    const dx = direction.x * cos - direction.z * sin;
    const dz = direction.x * sin + direction.z * cos;
    
    character.position.x += dx * speed * delta;
    character.position.z += dz * speed * delta;
    
    // Rotate Mohamed to face movement direction
    if (mohamedModel) {
      const targetAngle = Math.atan2(dx, dz);
      mohamedModel.rotation.y = targetAngle;
    }
    
    // Animation blending based on speed
    if (animations.run && animations.walk && isRunning && canJump) {
      if (currentAction !== animations.run) {
        fadeToAction(animations.run);
      }
    } else if (animations.walk && canJump) {
      if (currentAction !== animations.walk) {
        fadeToAction(animations.walk);
      }
    }
  } else {
    // Idle animation when not moving
    if (animations.idle && currentAction !== animations.idle && canJump) {
      fadeToAction(animations.idle);
    }
    
    // When idle, keep Mohamed facing away from camera
    if (mohamedModel) {
      mohamedModel.rotation.y = cameraYaw;
    }
  }

  // Apply vertical velocity and stop at ground
  character.position.y += velocity.y * delta;
  if (character.position.y < 0) {
    velocity.y = 0;
    character.position.y = 0;
    canJump = true;
  }

  // Position camera based on yaw and pitch
  const distance = cameraOffset.z;
  const height = cameraOffset.y;
  
  const camX = character.position.x + Math.sin(cameraYaw) * distance * Math.cos(cameraPitch);
  const camZ = character.position.z + Math.cos(cameraYaw) * distance * Math.cos(cameraPitch);
  const camY = character.position.y + height + Math.sin(cameraPitch) * distance;
  
  desiredCamPos = new THREE.Vector3(camX, camY, camZ);
  
  // Smooth camera movement
  camera.position.lerp(desiredCamPos, 1 - Math.pow(0.01, delta));
  camera.lookAt(character.position.x, character.position.y + 1.0, character.position.z);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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


