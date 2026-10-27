import './style.css';
import * as THREE from 'three';
import { buildTerrain, heightAt, islandRadius, HILL, ISLET, DOCK, dockStart, onDock, caveFloor, caveLocal, CAVE } from './world/terrain';
import { buildZones } from './world/zones';
import { Robot } from './world/robot';
import { buildWater } from './world/water';
import { buildScenery } from './world/props';
import { buildGrass } from './world/grass';
import { installToon } from './world/toon';
import { buildLandmarks } from './world/landmarks';
import { buildLife } from './world/life';
import { buildSplash } from './world/splash';
import { buildDiorama } from './world/diorama';
import { buildNature } from './world/nature';
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
import { settings, CAMERA_DIST, RESOLUTIONS, RESOLUTION_LABEL, BACKENDS } from './settings';
import { detectQuality } from './quality';
import { createGfx } from './gfx';
import { AdaptiveRes, DebugOverlay } from './perf';
import { afterReveal, initAssets, markRevealed } from './assets/loader';
import { Avatar } from './avatar/avatar';
import { hasSavedConfig, loadConfig, saveConfig } from './avatar/config';
import { AvatarUI } from './avatar/ui';
import { CharacterSelect } from './avatar/select';
import { Coop } from './coop/host';

installToon(); // antes de compilar ningún material
const q = detectQuality();
// WebGL o WebGPU según los ajustes (WebGPU es experimental y se descarga aparte; sin soporte se usa WebGL)
const gfx = await createGfx(document.getElementById('gl') as HTMLCanvasElement, q);
const { renderer, canvas } = gfx;
renderer.setPixelRatio(q.dpr);
renderer.shadowMap.enabled = q.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
initAssets();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);

/* luz fija de amanecer */
const dawn = new Dawn(scene, gfx.envFactory());
dawn.sun.castShadow = q.shadows;
dawn.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
const sc = dawn.sun.shadow.camera;
sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 150;
dawn.sun.shadow.bias = -0.0004; dawn.sun.shadow.normalBias = 0.04;
gfx.initShadows(dawn.sun); // la sombra se recalcula a ritmo propio (ver el bucle)
scene.fog = new THREE.FogExp2(dawn.fogColor, 0.0045);

/* mundo: lo estático se fusiona al final para reducir llamadas de dibujo */
const staticWorld = new THREE.Group();
scene.add(staticWorld);
const terrain = buildTerrain(q.tier !== 'low');
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
obstacles.push(...buildZones(scene, q.tier).obstacles); // parcelas, cofre, vallas y el interior de la cueva
const interactables = new Interactables(scene, obstacles, q.tier); // antes que los árboles: así no se plantan encima
const nature = buildNature(scene, obstacles, q.tier, q.mobile); // MegaKit + Sketchfab: árboles por biomas, claros, caminos de piedra
batchStatic(staticWorld, 22); // por celdas de 22 m: la cámara descarta las zonas que no se ven
const splash = buildSplash(scene);
const life = buildLife(scene, q.tier === 'high' ? 90 : q.tier === 'med' ? 60 : 24);
// en calidad baja, solo la hoja ligera; en móvil, menos hojas, un anillo de bloques menos y la hoja completa solo muy cerca
const grass = q.mobile && q.tier === 'med'
  ? buildGrass(10, false, q.shadows, { maxRing: 2, nearFull: 12 })
  : buildGrass(q.tier === 'high' ? 30 : q.tier === 'med' ? 18 : 6, q.tier === 'low', q.shadows);
scene.add(grass.group);
const guide = new CatGuide(scene, obstacles, 7.6, 10.4, [6, 12]);
void guide.load().catch((e) => console.warn('Misu no disponible:', e));
const robot = new Robot(scene, obstacles, [-1.2, -0.8], 2.2); // pasea por la plaza y saluda
void afterReveal.then(() => robot.load()).catch((e) => console.warn('robot no disponible:', e));

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
const coop = new Coop(scene, obstacles, player.group); // invitados con el móvil como mando (QR)
const post = gfx.createPost(scene, camera, q);
const debug = new DebugOverlay();
if (new URLSearchParams(location.search).has('tune')) {
  void import('./tune').then((m) => m.openTune({ dawn, scene, terrain, water, post }));
}

let avatarUI: AvatarUI | null = null, charSelect: CharacterSelect | null = null;
const avatarBtn = document.getElementById('avatarBtn') as HTMLButtonElement;
avatarBtn.disabled = true;
/* pantalla de carga: se mantiene hasta que el avatar esté puesto (o falle) y pasen al menos 2 s, para que no se vea al personaje de respaldo cambiar de golpe */
const loadStart = performance.now();
const MIN_LOAD_MS = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2000, MAX_LOAD_MS = 10000;
let avatarSettled = false, revealed = false;
function checkReveal() {
  if (revealed || first) return; // hace falta al menos un fotograma dibujado
  const elapsed = performance.now() - loadStart;
  if (!avatarSettled && elapsed < MAX_LOAD_MS) return;
  revealed = true;
  markRevealed();
  ui.setLoad(1, 'Todo listo');
  setTimeout(() => {
    ui.ready();
    if (charSelect && !hasSavedConfig()) charSelect.toggle(true, false); // primera visita: elegir personaje antes de jugar
  }, Math.max(350, MIN_LOAD_MS - elapsed)); // 350 ms: se ve la barra llena antes del fundido
}
void Avatar.create().then(async (a) => {
  await a.apply(loadConfig());
  player.attachAvatar(a);
  avatarUI = new AvatarUI(a);
  avatarBtn.disabled = false;
  charSelect = new CharacterSelect(gfx);
  charSelect.onPick = (cfg) => void a.apply(cfg);
  charSelect.onCustom = () => { saveConfig(a.getConfig()); avatarUI?.toggle(true); }; // se guarda ya: así no vuelve a salir el selector
}).catch((e) => console.warn('Avatar modular no disponible, uso el de respaldo:', e)).finally(() => { avatarSettled = true; ui.setLoad(0.95, 'Todo listo'); });

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
      { type: 'info', label: 'Naturaleza, casas y animaciones', value: 'Quaternius (CC0)' },
      { type: 'info', label: 'Misu (Casual Assassin Cat)', value: 'Sketchfab' },
      { type: 'info', label: 'Robot Claude', value: 'Domingo, con Tripo' },
      { type: 'info', label: 'Tronco caído y tocón musgoso', value: 'neon_dust (CC-BY 4.0)' },
      { type: 'info', label: 'Tocón', value: 'metrosp (CC-BY 4.0)' },
      { type: 'info', label: 'Isla flotante', value: 'Tom Verbeeck (CC-BY 4.0)' },
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
      // cambiar de motor gráfico obliga a recargar: el renderer no se puede sustituir en caliente
      'gpu' in navigator
        ? { type: 'select' as const, label: 'MOTOR', options: ['WEBGL', 'WEBGPU β'], get: () => BACKENDS.indexOf(settings.value.backend), set: (i: number) => { settings.set('backend', BACKENDS[i]); location.reload(); } }
        : { type: 'info' as const, label: 'MOTOR', value: 'WEBGL' },
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
      ...(charSelect ? [{ type: 'action' as const, label: 'Cambiar de personaje', run: () => { menu.close(); charSelect?.toggle(true); } }] : []),
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
  gfx.requestShadow(dawn.sun);
  post.setEnabled(s.effects && q.tier !== 'low');
  grass.setInkMask(s.effects && q.tier !== 'low'); // la máscara de contornos solo sirve (y solo es segura) con el postprocesado
  nature.setInkMask(s.effects && q.tier !== 'low');
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
const blocked = () => menu.open || dialogue.open || ui.isOpen || (guestbook?.open ?? false) || (avatarUI?.open ?? false) || (charSelect?.open ?? false);
type Target = { kind: 'station'; project: Project } | { kind: 'npc' } | { kind: 'guestbook' } | null;
const NPC_TARGET: Target = { kind: 'npc' }, GUESTBOOK_TARGET: Target = { kind: 'guestbook' };
const stationTargets = new Map<Project, Target>(); // se llama cada fotograma: no se crean objetos nuevos
function pickTarget(): Target {
  const s = interactables.nearest;
  const dS = s ? Math.hypot(player.group.position.x - s.group.position.x, player.group.position.z - s.group.position.z) : 99;
  const dN = guide.distanceTo(player.group.position);
  const dG = infoPoint ? infoPoint.distanceTo(player.group.position) : 99;
  if (dG < InfoPoint.REACH && dG <= dN && dG <= dS) return GUESTBOOK_TARGET;
  if (dN < CatGuide.REACH && dN <= dS) return NPC_TARGET;
  if (!s) return null;
  let t = stationTargets.get(s.project);
  if (!t) { t = { kind: 'station', project: s.project }; stationTargets.set(s.project, t); }
  return t;
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
ui.onAvatar = () => { if (!menu.open && !dialogue.open && !ui.isOpen && !charSelect?.open) avatarUI?.toggle(); };
dialogue.onStart = () => { achievements.unlock('friend'); guide.talking = true; };
dialogue.onClose = () => { guide.talking = false; };
dialogue.onAction = (a) => { if (a === 'showPaths') interactables.pulse(4.5, timer.getElapsed()); };

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
const WRECK = zone(1.38, 0.93);
const DOCK_END = [Math.cos(DOCK.a) * (dockStart() + DOCK.len - 1.2), Math.sin(DOCK.a) * (dockStart() + DOCK.len - 1.2)] as const;
function checkZones(p: THREE.Vector3) {
  const near = (c: readonly [number, number], r: number) => Math.hypot(p.x - c[0], p.z - c[1]) < r;
  if (near(WRECK, 5)) achievements.unlock('wreck');
  if (player.inCave) achievements.unlock('cave');
  if (near(HILL, 3.2) && p.y > 5) achievements.unlock('lighthouse');
  if (near(ISLET, 5)) achievements.unlock('islet');
  if (onDock(p.x, p.z) && near(DOCK_END, 1.8)) achievements.unlock('sailor');
}

/* ---------- bucle ---------- */
// THREE.Timer sustituye a Clock (obsoleto): con connect() ignora el tiempo en que la pestaña está oculta y no da un salto enorme al volver
const timer = new THREE.Timer();
timer.connect(document);
/** altura de la mirada de la cámara sobre los pies (el personaje mide 1,70 m) */
const EYE = 1.15;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camHead = new THREE.Vector3();
function camBlocked(p: THREE.Vector3): boolean {
  // en la cueva la cámara no sale del túnel (salvo hacia la boca)
  if (player.inCave) return caveLocal(p.x, p.z)[0] > CAVE.notch - 0.4 && Number.isNaN(caveFloor(p.x, p.z, 0.3));
  if (nature.blocks(p)) return true;
  if (p.y > 9) return false;
  for (const o of obstacles) if (o.r >= 1.4 && Math.hypot(p.x - o.x, p.z - o.z) < o.r + 0.6) return true;
  return false;
}
let shownPrompt: string | null = null;
let first = true, frameNo = 0, traveled = 0, swimT = 0, zoneT = 0, rippleT = 0, wasWet = false;
const last = player.group.position.clone();

function frame(timestamp: number) {
  if (first) timer.reset(); // el primer fotograma llega tras una carga larga: sin esto el primer delta sería de varios segundos
  timer.update(timestamp);
  const raw = Math.max(0, timer.getDelta()), dt = Math.min(raw, 0.05), t = timer.getElapsed();
  adaptive.tick(raw * 1000, settings.value.resolution === 'auto');
  input.enabled = !blocked();
  input.update();
  player.update(dt, input, t);
  coop.update(dt, t, input.yaw);
  interactables.update(t, player.group.position);
  guide.update(dt, t, player.group.position);
  robot.update(dt, t, player.group.position);
  infoPoint?.update(t, player.group.position);
  presence?.send(player.group.position.x, player.group.position.z, player.group.rotation.y, Math.min(1, player.vel.length() / 6.5), player.swimming, performance.now());
  ghosts.update(dt, t, performance.now());
  grass.update(t, camera.position, player.group.position);
  nature.update(t, player.group.position);
  for (const p of palms) {
    // LOD: a más de 48 m se dibuja la versión ligera (con 4 m de histéresis para que no parpadee en el límite)
    const dp = Math.hypot(camera.position.x - p.group.position.x, camera.position.z - p.group.position.z);
    if (p.far ? dp < 44 : dp > 48) p.setFar(!p.far);
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
  if (avatarUI?.open) { input.yaw = player.group.rotation.y; input.pitch = 0.12; input.dist = 3.8; camDistChanged = true; }
  else if (camDistChanged && !avatarUI?.open) { input.dist = CAMERA_DIST[settings.value.camera]; camDistChanged = false; }
  const fp = coop.focus(pp); // con invitados, la cámara se aleja para que quepan todos
  const camDist = player.inCave ? Math.min(input.dist, 4.5) : input.dist + coop.spread, camPitch = player.inCave ? Math.min(input.pitch, 0.3) : input.pitch;
  const cp = Math.cos(camPitch);
  camPos.set(fp.x + Math.sin(input.yaw) * cp * camDist, fp.y + EYE + Math.sin(camPitch) * camDist, fp.z + Math.cos(input.yaw) * cp * camDist);
  if (player.inCave) camPos.y = THREE.MathUtils.clamp(camPos.y, pp.y + 0.6, pp.y + 2.3); // bajo el techo
  else camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 0.8, 0.6);
  for (let k = 0; k < 14 && camBlocked(camPos); k++) camPos.lerp(camHead.set(fp.x, fp.y + EYE, fp.z), 0.12);
  camLook.set(fp.x, fp.y + EYE - 0.15, fp.z);
  if (first) camera.position.copy(camPos);
  else camera.position.lerp(camPos, 1 - Math.exp(-14 * dt));
  camera.lookAt(camLook);

  dawn.update(pp, t);
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
    // en móvil la sombra se recalcula a 30 Hz solo mientras el personaje se mueve; quieto basta con 15 Hz (los NPC se mueven despacio)
    const moving = player.vel.lengthSq() > 0.01;
    // solo se pide, nunca se cancela aquí: three la marca como hecha tras dibujarla. Antes se asignaba y en el primer fotograma
    // borraba la petición inicial, así que se dibujaba sin mapa de sombra (WebGL: "Mismatch between texture format and sampler type")
    if (q.mobile && !moving ? (frameNo & 3) === 0 : (frameNo & 1) === 0) gfx.requestShadow(dawn.sun);
    gfx.resetStats();
    post.render(dt);
    debug.update(raw * 1000, gfx, adaptive.dpr);
  }
  if (first) { first = false; ui.setLoad(avatarSettled ? 0.95 : 0.6, avatarSettled ? 'Todo listo' : 'Vistiendo al personaje…'); }
  checkReveal();
}
renderer.setAnimationLoop(frame);

// útil para depurar sin tocar el código
(window as unknown as { __dbg: unknown }).__dbg = { nature, presence, ghosts, guestbook, player, input, interactables, renderer, gfx, q, dawn, splash, post, scene, camera, guide, robot, coop, menu, dialogue, achievements, settings, adaptive, charSelect: () => charSelect };

/** El módulo se inicializa al importarse; `start` existe para que la entrada pueda esperar a que termine la carga. */
export function start() { /* sin acciones adicionales */ }
