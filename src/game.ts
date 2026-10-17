import './style.css';
import * as THREE from 'three';
import { buildTerrain, heightAt, islandRadius, HILL, ISLET, DOCK, dockStart, onDock } from './world/terrain';
import { buildWater } from './world/water';
import { buildScenery } from './world/props';
import { buildGrass } from './world/grass';
import { buildLandmarks } from './world/landmarks';
import { buildLife } from './world/life';
import { buildSplash } from './world/splash';
import { buildDiorama } from './world/diorama';
import { buildTrees } from './world/trees';
import { buildVillage } from './world/village';
import { batchStatic } from './world/batch';
import { Dawn } from './world/dawn';
import { CatGuide } from './world/npc';
import { Ambience } from './audio';
import { Player } from './player';
import { Input } from './input';
import { Interactables, type Project } from './interactables';
import { goClassic } from './mode';
import { apiConfigured } from './net/api';
import { Presence } from './net/presence';
import { Ghosts } from './world/ghosts';
import { InfoPoint } from './world/infopoint';
import { GuestbookPanel } from './ui/guestbookPanel';
import { UI } from './ui';
import { Menu, type View } from './ui/menu';
import { Dialogue } from './ui/dialogue';
import { Toasts } from './ui/toasts';
import { Achievements, ACHIEVEMENTS } from './achievements';
import { settings, CAMERA_DIST, RESOLUTIONS, RESOLUTION_LABEL } from './settings';
import { detectQuality } from './quality';
import { createPost } from './post';
import { AdaptiveRes, DebugOverlay } from './perf';
import { initAssets } from './assets/loader';
import { Avatar } from './avatar/avatar';
import { loadConfig } from './avatar/config';
import { AvatarUI } from './avatar/ui';

const q = detectQuality();
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.tier === 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(q.dpr);
renderer.shadowMap.enabled = q.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // la sombra se recalcula a 30 Hz (ver el bucle)
renderer.info.autoReset = false;
initAssets(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);

/* luz fija de amanecer */
const dawn = new Dawn(scene, renderer);
dawn.sun.castShadow = q.shadows;
dawn.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
const sc = dawn.sun.shadow.camera;
sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 150;
dawn.sun.shadow.bias = -0.0004; dawn.sun.shadow.normalBias = 0.04;
renderer.shadowMap.needsUpdate = true; // con autoUpdate apagado, el primer fotograma necesita generar el mapa o el sampler de sombra queda sin textura válida
scene.fog = new THREE.FogExp2(dawn.fogColor, 0.0045);

/* mundo: lo estático se fusiona al final para reducir llamadas de dibujo */
const staticWorld = new THREE.Group();
scene.add(staticWorld);
const terrain = buildTerrain();
scene.add(terrain);
const terrainTime = terrain.userData.uTime as { value: number };
const water = buildWater(dawn.sunDir);
scene.add(water.mesh);
const { palms, obstacles } = buildScenery(staticWorld);
const landmarks = buildLandmarks(staticWorld);
obstacles.push(...landmarks.obstacles);
const diorama = buildDiorama(staticWorld);
obstacles.push(...diorama.obstacles);
const village = buildVillage(staticWorld);
obstacles.push(...village.obstacles);
const interactables = new Interactables(scene, obstacles, q.tier); // antes que los árboles: así no se plantan encima
const trees = buildTrees(scene, obstacles, q.tier === 'low' ? 8 : 15);
batchStatic(staticWorld, 22); // por celdas de 22 m: la cámara descarta las zonas que no se ven
const splash = buildSplash(scene);
const life = buildLife(scene, q.tier === 'high' ? 90 : q.tier === 'med' ? 60 : 24);
const grass = buildGrass(q.tier === 'high' ? 60000 : q.tier === 'med' ? 30000 : 10000);
scene.add(grass.group);
const guide = new CatGuide(scene, obstacles, 7.6, 10.4, [6, 12]);
void guide.load().catch((e) => console.warn('Misu no disponible:', e));

/* backend opcional: libro de visitas, contacto y visitantes fantasma (solo si hay API configurada) */
const infoPoint = apiConfigured ? new InfoPoint(scene, obstacles, 3.2, 12.2) : null;
const guestbook = apiConfigured ? new GuestbookPanel() : null;
const presence = apiConfigured ? new Presence() : null;
const ghosts = new Ghosts(scene);

const audio = new Ambience();
addEventListener('pointerdown', () => audio.start());
addEventListener('keydown', () => audio.start());

/* interfaz */
const input = new Input(canvas);
const ui = new UI();
const toasts = new Toasts();
const dialogue = new Dialogue();
const achievements = new Achievements();
achievements.onUnlock = (a) => toasts.show(a);
ui.setCounter(achievements.opened.size);
ui.setTotal(interactables.stations.length);
const player = new Player(obstacles, [6, 12]);
scene.add(player.group);
const post = createPost(renderer, scene, camera, q);
const debug = new DebugOverlay();
if (new URLSearchParams(location.search).has('tune')) {
  void import('./tune').then((m) => m.openTune({ dawn, scene, terrain, water, post }));
}

let avatarUI: AvatarUI | null = null;
const avatarBtn = document.getElementById('avatarBtn') as HTMLButtonElement;
avatarBtn.disabled = true;
void Avatar.create().then(async (a) => {
  await a.apply(loadConfig());
  player.attachAvatar(a);
  avatarUI = new AvatarUI(a);
  avatarBtn.disabled = false;
}).catch((e) => console.warn('Avatar modular no disponible, uso el de respaldo:', e));

/* ---------- menú ---------- */
function achievementsView(): View {
  return {
    title: 'Logros', sub: `${achievements.count}/${ACHIEVEMENTS.length} · ${achievements.xp} XP`,
    hint: 'Esc volver',
    rows: [
      ...ACHIEVEMENTS.map((a) => ({ type: 'info' as const, label: `${achievements.has(a.id) ? '✓' : '·'} ${a.title}`, value: achievements.has(a.id) ? `+${a.xp}` : '???' })),
      { type: 'action', label: 'Atrás', run: () => menu.back() },
    ],
  };
}
function creditsView(): View {
  return {
    title: 'Créditos', sub: 'Gracias', hint: 'Esc volver',
    rows: [
      { type: 'info', label: 'Avatar y modelos', value: 'Wawa Sensei' },
      { type: 'info', label: 'Estilo de referencia', value: 'Petit Island' },
      { type: 'info', label: 'Motor', value: 'three.js' },
      { type: 'info', label: 'Interfaz', value: 'Isla Coral' },
      { type: 'action', label: 'Atrás', run: () => menu.back() },
    ],
  };
}
function settingsView(): View {
  const s = settings.value;
  return {
    title: 'Ajustes', sub: 'Se guardan solos',
    rows: [
      { type: 'toggle', label: 'SONIDO', get: () => settings.value.sound, set: (v) => settings.set('sound', v) },
      { type: 'bar', label: 'VOLUMEN', max: 8, get: () => settings.value.volume, set: (n) => settings.set('volume', n) },
      { type: 'toggle', label: 'SOMBRAS', get: () => settings.value.shadows, set: (v) => settings.set('shadows', v) },
      { type: 'toggle', label: 'EFECTOS', get: () => settings.value.effects, set: (v) => settings.set('effects', v) },
      ...(apiConfigured ? [{ type: 'toggle' as const, label: 'VISITANTES', get: () => settings.value.ghosts, set: (v: boolean) => settings.set('ghosts', v) }] : []),
      { type: 'select', label: 'RESOLUCIÓN', options: RESOLUTIONS.map((r) => RESOLUTION_LABEL[r]), get: () => RESOLUTIONS.indexOf(s.resolution), set: (i) => settings.set('resolution', RESOLUTIONS[i]) },
      { type: 'select', label: 'CÁMARA', options: ['CERCA', 'MEDIA', 'LEJOS'], get: () => settings.value.camera, set: (i) => settings.set('camera', i) },
      { type: 'action', label: 'Atrás', run: () => menu.back() },
    ],
  };
}
function mainView(): View {
  return {
    title: 'Pausa', sub: 'Playa del Desarrollador',
    rows: [
      { type: 'action', label: 'Continuar', run: () => menu.close() },
      { type: 'action', label: 'Mi avatar', run: () => { menu.close(); avatarUI?.toggle(true); } },
      { type: 'action', label: 'Ajustes', run: () => menu.push(settingsView()) },
      { type: 'action', label: 'Logros', run: () => menu.push(achievementsView()) },
      { type: 'action', label: 'Créditos', run: () => menu.push(creditsView()) },
      { type: 'action', label: 'Versión clásica', run: () => goClassic() },
    ],
  };
}
const menu = new Menu(mainView);
ui.onPause = () => { if (!blocked()) menu.show(); };

/* ---------- ajustes en vivo ---------- */
let camDistChanged = true;
const adaptive = new AdaptiveRes(q.dpr, 0.55, (dpr) => { renderer.setPixelRatio(dpr); resize(); });
const onlineEl = document.getElementById('online') as HTMLElement;
function setPresence(on: boolean) {
  if (!presence) return;
  if (on && !presence.connected) presence.start();
  else if (!on) { presence.stop(); ghosts.clear(); }
  ghosts.enabled = on;
}
if (presence) {
  presence.onPeers = (rows) => ghosts.apply(rows, performance.now());
  presence.onBye = (id) => ghosts.remove(id);
  presence.onCount = (n) => { onlineEl.hidden = n < 1; onlineEl.textContent = n === 1 ? '👻 Estás solo en la isla' : `👻 ${n} visitantes en la isla`; };
  ghosts.onFirst = () => achievements.unlock('company');
}
function applySettings(key?: string) {
  const s = settings.value;
  audio.setMuted(!s.sound);
  audio.setVolume(s.volume);
  ui.setMuted(!s.sound);
  dawn.sun.castShadow = s.shadows && q.shadows;
  renderer.shadowMap.needsUpdate = true;
  post.setEnabled(s.effects && q.tier !== 'low');
  setPresence(s.ghosts);
  if (key === undefined || key === 'resolution') {
    if (s.resolution === 'auto') adaptive.setMax(q.dpr);
    else adaptive.fix(s.resolution === 'high' ? Math.min(devicePixelRatio || 1, 2) : s.resolution === 'medium' ? 1.25 : 0.85);
  }
  if (key === undefined || key === 'camera') { input.dist = CAMERA_DIST[s.camera]; camDistChanged = true; }
  menu.refresh();
}
settings.onChange((_, key) => applySettings(key));

/* ---------- interacción ---------- */
const blocked = () => menu.open || dialogue.open || ui.isOpen || (guestbook?.open ?? false) || (avatarUI?.open ?? false);
type Target = { kind: 'station'; project: Project } | { kind: 'npc' } | { kind: 'guestbook' } | null;
function pickTarget(): Target {
  const s = interactables.nearest;
  const dS = s ? Math.hypot(player.group.position.x - s.group.position.x, player.group.position.z - s.group.position.z) : 99;
  const dN = guide.distanceTo(player.group.position);
  const dG = infoPoint ? infoPoint.distanceTo(player.group.position) : 99;
  if (dG < InfoPoint.REACH && dG <= dN && dG <= dS) return { kind: 'guestbook' };
  if (dN < CatGuide.REACH && dN <= dS) return { kind: 'npc' };
  return s ? { kind: 'station', project: s.project } : null;
}
function interact() {
  if (blocked()) return;
  const t = pickTarget();
  if (!t) return;
  ui.setPrompt(null);
  if (t.kind === 'npc') dialogue.start();
  else if (t.kind === 'guestbook') guestbook?.openPanel();
  else {
    ui.openProject(t.project);
    achievements.markOpened(t.project.id, interactables.stations.length);
    ui.setCounter(achievements.opened.size);
    document.getElementById('counter')?.classList.remove('bump');
    void document.getElementById('counter')?.offsetWidth;
    document.getElementById('counter')?.classList.add('bump');
  }
}
input.onInteract = interact;
input.onEscape = () => { if (!blocked()) menu.show(); };
ui.onPromptClick = interact;
ui.onAvatar = () => { if (!menu.open && !dialogue.open && !ui.isOpen) avatarUI?.toggle(); };
dialogue.onStart = () => achievements.unlock('friend');
dialogue.onAction = (a) => { if (a === 'showPaths') interactables.pulse(4.5, clock.elapsedTime); };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
applySettings();

/* ---------- zonas para los logros ---------- */
const zone = (a: number, f: number) => { const r = islandRadius(a) * f; return [Math.cos(a) * r, Math.sin(a) * r] as const; };
const WRECK = zone(1.38, 0.93), CAVE = zone(2.15, 0.86);
const DOCK_END = [Math.cos(DOCK.a) * (dockStart() + DOCK.len - 1.2), Math.sin(DOCK.a) * (dockStart() + DOCK.len - 1.2)] as const;
function checkZones(p: THREE.Vector3) {
  const near = (c: readonly [number, number], r: number) => Math.hypot(p.x - c[0], p.z - c[1]) < r;
  if (near(WRECK, 5)) achievements.unlock('wreck');
  if (near(CAVE, 5.5)) achievements.unlock('cave');
  if (near(HILL, 3.2) && p.y > 5) achievements.unlock('lighthouse');
  if (near(ISLET, 5)) achievements.unlock('islet');
  if (onDock(p.x, p.z) && near(DOCK_END, 1.8)) achievements.unlock('sailor');
}

/* ---------- bucle ---------- */
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camHead = new THREE.Vector3();
function camBlocked(p: THREE.Vector3): boolean {
  if (trees.blocks(p)) return true;
  if (p.y > 9) return false;
  for (const o of obstacles) if (o.r >= 1.4 && Math.hypot(p.x - o.x, p.z - o.z) < o.r + 0.6) return true;
  return false;
}
let shownPrompt: string | null = null;
let first = true, frameNo = 0, traveled = 0, swimT = 0, zoneT = 0, rippleT = 0, wasWet = false;
const last = player.group.position.clone();

function frame() {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05), t = clock.elapsedTime;
  adaptive.tick(raw * 1000, settings.value.resolution === 'auto');
  input.enabled = !blocked();
  input.update();
  player.update(dt, input, t);
  interactables.update(t, player.group.position);
  guide.update(dt, t, player.group.position);
  infoPoint?.update(t, player.group.position);
  presence?.send(player.group.position.x, player.group.position.z, player.group.rotation.y, Math.min(1, player.vel.length() / 6.5), player.swimming, performance.now());
  ghosts.update(dt, t, performance.now());
  grass.update(t, camera.position);
  trees.update(t, camera.position);
  for (const p of palms) {
    p.crown.rotation.z = Math.sin(t * 0.9 + p.phase) * 0.025;
    p.crown.rotation.x = Math.cos(t * 0.7 + p.phase) * 0.02;
  }

  // logros por movimiento y por zonas
  const pp = player.group.position;
  traveled += Math.hypot(pp.x - last.x, pp.z - last.z);
  last.copy(pp);
  if (traveled > 14) achievements.unlock('steps');
  swimT = player.swimming ? swimT + dt : 0;
  if (swimT > 2.5) achievements.unlock('swimmer');
  if ((zoneT += dt) > 0.3) { zoneT = 0; checkZones(pp); }

  // olas capilares: un golpe al entrar en el agua y anillos suaves mientras te mueves por ella
  const wet = heightAt(pp.x, pp.z) < 0.12 && !onDock(pp.x, pp.z);
  rippleT += dt;
  if (wet && !wasWet) { water.ripple(pp.x, pp.z, t, 1); splash.crown(pp.x, pp.z, t, Math.min(1, 0.45 + player.vel.length() / 8)); rippleT = 0; }
  else if (wet && player.vel.length() > 0.8 && rippleT > 0.42) { water.ripple(pp.x, pp.z, t, player.swimming ? 0.9 : 0.55); rippleT = 0; }
  wasWet = wet;

  // cámara en tercera persona con suavizado y sin atravesar el suelo
  if (avatarUI?.open) { input.yaw = player.group.rotation.y; input.pitch = 0.12; input.dist = 4.2; camDistChanged = true; }
  else if (camDistChanged && !avatarUI?.open) { input.dist = CAMERA_DIST[settings.value.camera]; camDistChanged = false; }
  const cp = Math.cos(input.pitch);
  camPos.set(pp.x + Math.sin(input.yaw) * cp * input.dist, pp.y + 1.5 + Math.sin(input.pitch) * input.dist, pp.z + Math.cos(input.yaw) * cp * input.dist);
  camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 0.8, 0.6);
  for (let k = 0; k < 14 && camBlocked(camPos); k++) camPos.lerp(camHead.set(pp.x, pp.y + 1.5, pp.z), 0.12);
  camLook.set(pp.x, pp.y + 1.3, pp.z);
  if (first) camera.position.copy(camPos);
  else camera.position.lerp(camPos, 1 - Math.exp(-14 * dt));
  camera.lookAt(camLook);

  dawn.update(pp);
  terrainTime.value = t;
  landmarks.update(t, 0.35);
  diorama.update(t);
  life.update(t, dt, pp, 0, dawn.waterEnv.horizon);
  splash.update(t, dt);
  water.update(t, camera.position, dawn.waterEnv);
  post.setExposure(dawn.exposure);

  // aviso de interacción
  const tg = blocked() ? null : pickTarget();
  const label = tg ? (tg.kind === 'npc' ? 'Hablar con Misu' : tg.kind === 'guestbook' ? 'Libro de visitas y contacto' : tg.project.title) : null;
  if (label !== shownPrompt) { shownPrompt = label; ui.setPrompt(label); }

  // con el menú o una ficha abiertas basta con 30 fps; la sombra se recalcula en fotogramas alternos
  frameNo++;
  const idle = menu.open || ui.isOpen;
  if (!idle || (frameNo & 1) === 0) {
    renderer.shadowMap.needsUpdate = (frameNo & 1) === 0;
    renderer.info.reset();
    post.render(dt);
    debug.update(raw * 1000, renderer, adaptive.dpr);
  }
  if (first) { first = false; ui.ready(); }
}
renderer.setAnimationLoop(frame);

// útil para depurar sin tocar el código
(window as unknown as { __dbg: unknown }).__dbg = { presence, ghosts, guestbook, player, input, interactables, renderer, q, dawn, splash, scene, camera, guide, menu, dialogue, achievements, settings, adaptive };

/** El módulo se inicializa al importarse; `start` existe para que la entrada pueda esperar a que termine la carga. */
export function start() { /* sin acciones adicionales */ }
