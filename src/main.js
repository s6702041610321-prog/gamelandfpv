import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FPVController } from './controls.js';
import { soundManager } from './audio.js';

// DOM Elements
const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const hudScreen = document.getElementById('hud-screen');

const btnStart = document.getElementById('btn-start');
const btnResume = document.getElementById('btn-resume');
const btnToggleSound = document.getElementById('btn-toggle-sound');
const btnToggleTime = document.getElementById('btn-toggle-time');

const speedometerEl = document.getElementById('speedometer');
const stateBadgeEl = document.getElementById('state-badge');
const compassDirEl = document.getElementById('compass-dir');
const soundStatusEl = document.getElementById('sound-status');
const timeStatusEl = document.getElementById('time-status');

// Minimap Canvas
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

// Scene, Camera, Renderer
const scene = new THREE.Scene();
const skyColors = {
  DAY: '#78bdf0',
  SUNSET: '#ff7b54',
  NIGHT: '#060b18'
};

let currentSkyMode = 'DAY';
scene.background = new THREE.Color(skyColors.DAY);
scene.fog = new THREE.Fog(skyColors.DAY, 120, 450);

const getAspect = () => (window.innerWidth && window.innerHeight) ? (window.innerWidth / window.innerHeight) : (16 / 9);
const camera = new THREE.PerspectiveCamera(75, getAspect(), 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });

renderer.setSize(window.innerWidth || 1280, window.innerHeight || 720);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

// Controller
const controller = new FPVController(camera, document.body);

// Lights - Rich Ambient & Directional Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x78bdf0, 0xd0c4b4, 0.9);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
sunLight.position.set(50, 80, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
const d = 80;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

let isTourStarted = false;
let collidableObjects = [];

// Base Low-Poly Terrain Ground (Guarantees immediate 3D rendering)
const groundGeo = new THREE.PlaneGeometry(300, 300, 32, 32);
groundGeo.rotateX(-Math.PI / 2);
const posAttr = groundGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const z = posAttr.getZ(i);
  const y = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 1.5;
  posAttr.setY(i, y);
}
groundGeo.computeVertexNormals();

const groundMat = new THREE.MeshStandardMaterial({
  color: 0x4a8542,
  roughness: 0.8,
  metalness: 0.1,
  flatShading: true
});
const baseGround = new THREE.Mesh(groundGeo, groundMat);
baseGround.position.y = -0.1;
baseGround.receiveShadow = true;
scene.add(baseGround);
collidableObjects.push(baseGround);

controller.setCollidableObjects(collidableObjects);
controller.position.set(0, 3, 15);

// Load Low Poly GLB Model
const loader = new GLTFLoader();
const modelPaths = ['./lowpoly.glb', 'lowpoly.glb', '/lowpoly.glb'];

function tryLoadModel(index) {
  if (index >= modelPaths.length) return;
  loader.load(
    modelPaths[index],
    (gltf) => {
      const model = gltf.scene;
      scene.add(model);

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          collidableObjects.push(child);

          if (child.material) {
            child.material.flatShading = true;
            child.material.needsUpdate = true;
          }
        }
      });

      controller.setCollidableObjects(collidableObjects);

      const bbox = new THREE.Box3().setFromObject(model);
      const center = bbox.getCenter(new THREE.Vector3());
      controller.position.set(center.x, 3, center.z + 15);
    },
    undefined,
    () => {
      tryLoadModel(index + 1);
    }
  );
}
tryLoadModel(0);

// Ambient Floating Dust / Fireflies Particle Effect
const firefliesGeo = new THREE.BufferGeometry();
const fireflyCount = 100;
const fireflyPos = new Float32Array(fireflyCount * 3);

for (let i = 0; i < fireflyCount * 3; i += 3) {
  fireflyPos[i] = THREE.MathUtils.randFloatSpread(100);
  fireflyPos[i + 1] = THREE.MathUtils.randFloat(0.5, 15);
  fireflyPos[i + 2] = THREE.MathUtils.randFloatSpread(100);
}

firefliesGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));
const fireflyMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.3,
  transparent: true,
  opacity: 0.6,
  blending: THREE.AdditiveBlending
});
const fireflies = new THREE.Points(firefliesGeo, fireflyMat);
scene.add(fireflies);

// Pointer Lock Event Listeners
document.addEventListener('pointerlockchange', () => {
  const isLocked = (document.pointerLockElement === document.body || document.pointerLockElement === canvas);
  controller.isLocked = isLocked;

  if (isLocked) {
    soundManager.init();
    pauseScreen.classList.remove('active');
    pauseScreen.classList.add('hidden');
    pauseScreen.style.display = 'none';
    hudScreen.classList.remove('hidden');
    hudScreen.style.display = 'block';
  } else {
    if (isTourStarted) {
      pauseScreen.classList.remove('hidden');
      pauseScreen.classList.add('active');
      pauseScreen.style.display = 'flex';
      hudScreen.classList.add('hidden');
      hudScreen.style.display = 'none';
    }
  }
});

document.addEventListener('pointerlockerror', () => {
  console.warn("Pointer lock error - keeping tour viewable");
});

// Canvas click to request lock
canvas.addEventListener('click', () => {
  if (isTourStarted && !controller.isLocked) {
    controller.requestLock();
  }
});

// Function to start the 3D Tour
function startTour(e) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }

  isTourStarted = true;

  if (startScreen) {
    startScreen.classList.remove('active');
    startScreen.classList.add('hidden');
    startScreen.style.setProperty('display', 'none', 'important');
  }

  if (hudScreen) {
    hudScreen.classList.remove('hidden');
    hudScreen.style.setProperty('display', 'block', 'important');
  }

  soundManager.init();
  controller.requestLock();
}

window.onTourStarted = startTour;

// UI Event Handlers
if (btnStart) btnStart.addEventListener('click', startTour);
if (startScreen) {
  startScreen.addEventListener('click', (e) => {
    if (!isTourStarted) {
      startTour(e);
    }
  });
}

btnResume.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  pauseScreen.classList.remove('active');
  pauseScreen.classList.add('hidden');
  pauseScreen.style.display = 'none';
  hudScreen.classList.remove('hidden');
  hudScreen.style.display = 'block';
  controller.requestLock();
});

btnToggleSound.addEventListener('click', () => {
  const isEnabled = soundManager.toggleSound();
  soundStatusEl.innerText = isEnabled ? 'ON' : 'OFF';
});

// Cycle through Day -> Sunset -> Night atmosphere
btnToggleTime.addEventListener('click', () => {
  if (currentSkyMode === 'DAY') {
    currentSkyMode = 'SUNSET';
    timeStatusEl.innerText = 'SUNSET';
    scene.background.set(skyColors.SUNSET);
    scene.fog.color.set(skyColors.SUNSET);
    ambientLight.intensity = 0.7;
    sunLight.intensity = 1.5;
    sunLight.color.set('#ffaa55');
  } else if (currentSkyMode === 'SUNSET') {
    currentSkyMode = 'NIGHT';
    timeStatusEl.innerText = 'NIGHT';
    scene.background.set(skyColors.NIGHT);
    scene.fog.color.set(skyColors.NIGHT);
    ambientLight.intensity = 0.35;
    sunLight.intensity = 0.6;
    sunLight.color.set('#4466ff');
  } else {
    currentSkyMode = 'DAY';
    timeStatusEl.innerText = 'DAY';
    scene.background.set(skyColors.DAY);
    scene.fog.color.set(skyColors.DAY);
    ambientLight.intensity = 0.95;
    sunLight.intensity = 2.2;
    sunLight.color.set('#fffaed');
  }
});

// Render Compass Radar
function drawCompass() {
  minimapCtx.clearRect(0, 0, 120, 120);

  const centerX = 60;
  const centerY = 60;

  // Draw player arrow pointing in controller yaw direction
  minimapCtx.save();
  minimapCtx.translate(centerX, centerY);
  minimapCtx.rotate(-controller.yaw);

  minimapCtx.fillStyle = '#00ffaa';
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, -8);
  minimapCtx.lineTo(6, 7);
  minimapCtx.lineTo(-6, 7);
  minimapCtx.closePath();
  minimapCtx.fill();

  minimapCtx.restore();

  // Compass cardinal text
  const degrees = ((controller.yaw * (180 / Math.PI)) % 360 + 360) % 360;
  let dir = 'N';
  if (degrees >= 45 && degrees < 135) dir = 'W';
  else if (degrees >= 135 && degrees < 225) dir = 'S';
  else if (degrees >= 225 && degrees < 315) dir = 'E';
  compassDirEl.innerText = dir;
}

// Window Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Main Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  if (isTourStarted) {
    // FPV Controller Physics & Camera Update
    controller.update(delta);

    // Update HUD Speedometer & Movement State
    const kmh = (controller.getSpeed() * 3.6).toFixed(1);
    speedometerEl.innerText = `${kmh} km/h`;
    stateBadgeEl.innerText = controller.getStateString();

    // Update Compass Radar
    drawCompass();
  }

  // Animate Ambient Fireflies
  fireflies.rotation.y = time * 0.02;

  // Render Scene
  renderer.render(scene, camera);
}

// Start animation loop
animate();
