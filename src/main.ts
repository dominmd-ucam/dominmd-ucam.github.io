import './style.css';
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildTerrain, heightAt } from './world/terrain';
import { buildWater } from './world/water';
import { buildScenery } from './world/props';
import { Player } from './player';
import { Input } from './input';
import { Interactables } from './interactables';
import { UI } from './ui';
import { detectQuality } from './quality';

const q = detectQuality();
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(q.dpr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.shadowMap.enabled = q.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);

/* cielo y luz */
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(140));
const sky = new Sky();
sky.scale.setScalar(4000);
const su = sky.material.uniforms;
su.turbidity.value = 4; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
su.sunPosition.value.copy(sunDir);
scene.add(sky);

scene.add(new THREE.HemisphereLight('#bfe6ff', '#e7d3a2', 1.0));
const sun = new THREE.DirectionalLight('#fff0d2', 3.2);
sun.castShadow = q.shadows;
sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
const sc = sun.shadow.camera;
sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

/* mundo */
scene.add(buildTerrain());
const water = buildWater(sunDir);
scene.add(water.mesh);
const { palms, obstacles } = buildScenery(scene);
const interactables = new Interactables(scene, obstacles);

const input = new Input(canvas);
const ui = new UI();
const player = new Player(obstacles, [6, 12]);
scene.add(player.group);

function interact() {
  const s = interactables.nearest;
  if (!s || ui.isOpen) return;
  input.enabled = false;
  ui.setPrompt(null);
  ui.openProject(s.project);
}
input.onInteract = interact;
ui.onPromptClick = interact;
ui.onClose = () => { input.enabled = true; };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* bucle */
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let shownPrompt: string | null = null;
let first = true;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  input.update();
  player.update(dt, input);
  interactables.update(t, player.group.position);

  for (const p of palms) {
    p.crown.rotation.z = Math.sin(t * 0.9 + p.phase) * 0.025;
    p.crown.rotation.x = Math.cos(t * 0.7 + p.phase) * 0.02;
  }

  // cámara en tercera persona con suavizado y sin atravesar el suelo
  const pp = player.group.position;
  const cp = Math.cos(input.pitch);
  camPos.set(
    pp.x + Math.sin(input.yaw) * cp * input.dist,
    pp.y + 1.5 + Math.sin(input.pitch) * input.dist,
    pp.z + Math.cos(input.yaw) * cp * input.dist,
  );
  camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 0.8, 0.6);
  camLook.set(pp.x, pp.y + 1.3, pp.z);
  if (first) camera.position.copy(camPos);
  else camera.position.lerp(camPos, 1 - Math.exp(-14 * dt));
  camera.lookAt(camLook);

  // la luz y su sombra siguen al jugador
  sun.target.position.copy(pp);
  sun.position.copy(pp).addScaledVector(sunDir, 90);

  water.update(t, camera.position);

  const id = interactables.nearest?.project.id ?? null;
  if (id !== shownPrompt && !ui.isOpen) {
    shownPrompt = id;
    ui.setPrompt(interactables.nearest?.project ?? null);
  }

  renderer.render(scene, camera);
  if (first) { first = false; ui.ready(); }
}
renderer.setAnimationLoop(frame);

// útil para depurar sin tocar el código
(window as unknown as { __dbg: unknown }).__dbg = { player, input, interactables, renderer, q };
