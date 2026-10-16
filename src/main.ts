import './style.css';
import * as THREE from 'three';
import { buildTerrain, heightAt } from './world/terrain';
import { buildWater } from './world/water';
import { buildScenery } from './world/props';
import { buildGrass } from './world/grass';
import { buildLandmarks } from './world/landmarks';
import { buildLife } from './world/life';
import { Ambience } from './audio';
import { DayCycle, type Preset } from './world/dayCycle';
import { Player } from './player';
import { Input } from './input';
import { Interactables } from './interactables';
import { UI } from './ui';
import { detectQuality } from './quality';
import { createPost } from './post';
import { initAssets } from './assets/loader';

const q = detectQuality();
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.tier === 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(q.dpr);
renderer.shadowMap.enabled = q.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
initAssets(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);

/* cielo, luces, estrellas y entorno: todo lo controla el ciclo día/noche */
const day = new DayCycle(scene, renderer);
day.sun.castShadow = q.shadows;
day.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
const sc = day.sun.shadow.camera;
sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
day.sun.shadow.bias = -0.0004; day.sun.shadow.normalBias = 0.04;

/* mundo */
const terrain = buildTerrain();
scene.add(terrain);
const terrainTime = terrain.userData.uTime as { value: number };
const water = buildWater(day.sunDir);
scene.add(water.mesh);
const { palms, obstacles } = buildScenery(scene);
const landmarks = buildLandmarks(scene);
obstacles.push(...landmarks.obstacles);
const life = buildLife(scene);
scene.fog = new THREE.FogExp2('#cfe9f5', 0.0042);
const audio = new Ambience();
addEventListener('pointerdown', () => audio.start());
addEventListener('keydown', () => audio.start());
const grass = buildGrass(q.tier === 'high' ? 80000 : q.tier === 'med' ? 40000 : 15000);
scene.add(grass.mesh);
const interactables = new Interactables(scene, obstacles, q.tier);

const input = new Input(canvas);
const ui = new UI();
const player = new Player(obstacles, [6, 12]);
scene.add(player.group);
const post = createPost(renderer, scene, camera, q);

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
ui.onTime = (p: Preset | 'auto') => { if (p === 'auto') day.auto = true; else day.setPreset(p); };
ui.onMute = () => { audio.start(); return audio.toggleMute(); };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h);
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
  player.update(dt, input, t);
  interactables.update(t, player.group.position);
  grass.update(t);

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

  day.update(dt, pp, camera);
  terrainTime.value = t;
  landmarks.update(t, day.night);
  life.update(t, dt, pp, day.night, day.waterEnv.horizon);
  audio.setNight(day.night);
  (scene.fog as THREE.FogExp2).color.copy(day.fogColor);
  water.update(t, camera.position, day.waterEnv);
  post.setExposure(day.exposure);
  ui.setClock(day.clock, day.auto);

  const id = interactables.nearest?.project.id ?? null;
  if (id !== shownPrompt && !ui.isOpen) {
    shownPrompt = id;
    ui.setPrompt(interactables.nearest?.project ?? null);
  }

  post.render(dt);
  if (first) { first = false; ui.ready(); }
}
renderer.setAnimationLoop(frame);

// útil para depurar sin tocar el código
(window as unknown as { __dbg: unknown }).__dbg = { player, input, interactables, renderer, q, day, scene, camera };
