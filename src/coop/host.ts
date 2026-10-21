import './coop.css';
import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import { Player, type Controls } from '../player';
import { Avatar } from '../avatar/avatar';
import { randomConfig } from '../avatar/config';
import type { Obstacle } from '../world/props';
import { GUEST_COLORS } from './colors';
import { openRoom, newCode, cleanCode, type Link, type LinkKind, type PadMsg, type HostMsg, type Room } from './link';

const MAX_GUESTS = 4;
/** sin noticias del mando durante este tiempo, el invitado se va (el mando manda la entrada 10 veces por segundo) */
const TIMEOUT_MS = 6000;

const QR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="3,3 10,3 10,10 3,10" fill="#0f3440"/><polygon points="5,5 8,5 8,8 5,8" fill="#fffaf0"/><polygon points="14,3 21,3 21,10 14,10" fill="#0f3440"/><polygon points="16,5 19,5 19,8 16,8" fill="#fffaf0"/><polygon points="3,14 10,14 10,21 3,21" fill="#0f3440"/><polygon points="5,16 8,16 8,19 5,19" fill="#fffaf0"/><polygon points="14,14 17,14 17,17 14,17" fill="#ff7a59"/><polygon points="18,18 21,18 21,21 18,21" fill="#ff7a59"/><polygon points="18,14 21,14 21,16 18,16" fill="#1fb5b0"/><polygon points="14,18 16,18 16,21 14,21" fill="#1fb5b0"/></svg>';

function nameTag(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(15,52,64,.8)';
  g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(34, 32, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fbf7ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 28;
  do { g.font = `700 ${size}px Fredoka, system-ui, sans-serif`; size -= 2; } while (g.measureText(text).width > 180 && size > 12);
  g.fillText(text, 140, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(2.2, 0.55, 1);
  s.position.y = 2.25;
  return s;
}

/** Entrada de un invitado: la última que mandó su mando. Cumple lo que Player lee de Input. */
class RemoteControls implements Controls {
  move = { x: 0, y: 0 };
  yaw = 0;
  crouch = false;
  sprint = false;
  roll = false;
  jump = false;
  private j = 0; private k = 0;
  apply(m: Extract<PadMsg, { t: 'in' }>) {
    const len = Math.hypot(m.x, m.y), f = len > 1 ? 1 / len : 1;
    this.move.x = Number.isFinite(m.x) ? m.x * f : 0;
    this.move.y = Number.isFinite(m.y) ? m.y * f : 0;
    if (len < 0.12) this.move.x = this.move.y = 0;
    if (m.j !== this.j) { this.j = m.j; this.jump = true; }
    if (m.k !== this.k) {
      this.k = m.k;
      // como en el PC: agacharse corriendo es una voltereta
      if (!this.crouch && this.sprint) this.roll = true; else this.crouch = !this.crouch;
    }
    this.sprint = !!m.s && !this.crouch;
  }
  stop() { this.move.x = this.move.y = 0; this.sprint = false; }
}

interface Guest {
  link: Link<PadMsg, HostMsg>;
  n: number; name: string; color: string;
  player: Player; controls: RemoteControls;
  avatar: Avatar | null; tag: THREE.Sprite;
  seen: number; lastState: string;
}

/**
 * Multijugador local con el móvil como mando: el PC abre una sala, enseña un QR con la dirección de mando.html
 * y cada móvil que entra hace aparecer un personaje nuevo junto al tuyo. Todos se ven en la misma pantalla.
 */
export class Coop {
  private guests = new Map<Link<PadMsg, HostMsg>, Guest>();
  private room: Room | null = null;
  private opening: Promise<void> | null = null;
  private kind: LinkKind = new URLSearchParams(location.search).get('enlace') === 'local' ? 'local' : 'peer';
  private panel = document.createElement('aside');
  private btn = document.createElement('button');
  private fp = new THREE.Vector3();
  /** distancia extra de cámara para que quepan todos */
  spread = 0;
  onChange: (n: number) => void = () => {};

  constructor(private scene: THREE.Scene, private obstacles: Obstacle[], private host: THREE.Object3D) {
    this.btn.className = 'hex';
    this.btn.id = 'coopBtn';
    this.btn.setAttribute('aria-label', 'Invitar jugadores');
    this.btn.title = 'Invitar jugadores con el móvil';
    this.btn.innerHTML = QR_ICON + '<b class="coop-n" hidden></b>';
    document.querySelector('.hud-btns')?.prepend(this.btn);
    this.btn.addEventListener('click', () => this.toggle());

    this.panel.id = 'coopPanel';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Invitar jugadores');
    this.panel.innerHTML = `
      <div class="coop-card facet">
        <button class="coop-x" aria-label="Cerrar">✕</button>
        <h2>Invita a jugar</h2>
        <p class="coop-sub">Escanea el código con el móvil: se convierte en un mando y aparece un personaje nuevo en la isla.</p>
        <div class="coop-qr" aria-live="polite"><span>Abriendo la sala…</span></div>
        <p class="coop-code">Sala <b>·····</b></p>
        <div class="coop-row"><input class="coop-url" readonly aria-label="Dirección del mando"><button class="coop-copy">Copiar</button></div>
        <p class="coop-status" role="status"></p>
        <ul class="coop-list"></ul>
        <p class="coop-foot">Hasta ${MAX_GUESTS} invitados. El móvil necesita internet; los datos van directos entre el móvil y este PC.</p>
      </div>`;
    document.getElementById('game')?.append(this.panel);
    this.panel.querySelector('.coop-x')!.addEventListener('click', () => this.toggle(false));
    this.panel.querySelector('.coop-copy')!.addEventListener('click', () => {
      const url = (this.panel.querySelector('.coop-url') as HTMLInputElement).value;
      void navigator.clipboard?.writeText(url).then(() => this.status('Dirección copiada'), () => this.status('No se pudo copiar'));
    });
    addEventListener('pagehide', () => { for (const g of this.guests.values()) g.link.send({ t: 'fuera' }); this.room?.close(); });
  }

  get open() { return !this.panel.hidden; }
  get count() { return this.guests.size; }

  toggle(on = this.panel.hidden === true) {
    this.panel.hidden = !on;
    this.btn.classList.toggle('on', on);
    if (on) void this.start();
  }

  /** Abre la sala (una vez por página; el código se recuerda en la pestaña para que los mandos se reconecten tras recargar). */
  start(): Promise<void> {
    return (this.opening ??= (async () => {
      let code = '';
      try { code = cleanCode(sessionStorage.getItem('coop-room') ?? ''); } catch { /* sin almacenamiento */ }
      try {
        this.status(this.kind === 'local' ? 'Modo de prueba: mismo navegador' : 'Conectando con el servidor de enlace…');
        this.room = await openRoom(this.kind, code || newCode());
      } catch (e) {
        console.warn('coop: no se pudo abrir la sala', e);
        this.opening = null;
        this.qr(null);
        this.status('No se pudo abrir la sala. Comprueba la conexión y vuelve a pulsar el botón.', true);
        return;
      }
      try { sessionStorage.setItem('coop-room', this.room.code); } catch { /* ignorar */ }
      this.room.onJoin = (l) => this.join(l);
      const url = new URL('mando.html', location.href);
      url.search = ''; url.hash = '';
      url.searchParams.set('sala', this.room.code);
      if (this.kind === 'local') url.searchParams.set('enlace', 'local');
      this.qr(url.href);
      (this.panel.querySelector('.coop-url') as HTMLInputElement).value = url.href;
      this.panel.querySelector('.coop-code b')!.textContent = this.room.code;
      this.status('Lista. Esperando mandos…');
    })());
  }

  private qr(url: string | null) {
    const box = this.panel.querySelector('.coop-qr')!;
    if (!url) { box.innerHTML = '<span>Sin sala</span>'; return; }
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    box.querySelector('svg')?.setAttribute('aria-label', 'Código QR del mando');
  }

  private status(text: string, error = false) {
    const s = this.panel.querySelector('.coop-status') as HTMLElement;
    s.textContent = text;
    s.classList.toggle('err', error);
  }

  private join(link: Link<PadMsg, HostMsg>) {
    link.onMessage = (m) => this.message(link, m);
    link.onClose = () => this.leave(link);
  }

  private message(link: Link<PadMsg, HostMsg>, m: PadMsg) {
    const g = this.guests.get(link);
    if (g) g.seen = performance.now();
    if (m.t === 'hola') {
      if (g) return;
      if (this.guests.size >= MAX_GUESTS) { link.send({ t: 'lleno' }); setTimeout(() => link.close(), 300); return; }
      this.add(link, String(m.name ?? '').trim().slice(0, 16) || 'Invitado', m.color);
    } else if (!g) return;
    else if (m.t === 'in') g.controls.apply(m);
    else if (m.t === 'look') void this.dress(g);
    else if (m.t === 'adios') link.close();
  }

  private add(link: Link<PadMsg, HostMsg>, name: string, wanted: string) {
    const used = new Set([...this.guests.values()].map((g) => g.color));
    const color = GUEST_COLORS.includes(wanted) && !used.has(wanted) ? wanted : GUEST_COLORS.find((c) => !used.has(c)) ?? GUEST_COLORS[0];
    let n = 1;
    while ([...this.guests.values()].some((g) => g.n === n)) n++;
    const player = new Player(this.obstacles, this.spawnPoint());
    const tag = nameTag(name, color);
    player.group.add(tag);
    this.scene.add(player.group);
    const g: Guest = { link, n, name, color, player, controls: new RemoteControls(), avatar: null, tag, seen: performance.now(), lastState: '' };
    this.guests.set(link, g);
    link.send({ t: 'dentro', n, color });
    void this.dress(g);
    this.refresh();
    this.status(`¡${name} se ha unido!`);
  }

  /** Avatar modular con ropa al azar del color del invitado (mientras carga se ve el muñeco de respaldo). */
  private async dress(g: Guest) {
    const cfg = randomConfig();
    cfg.parts.Outfit = null;
    cfg.parts.Top ??= 0;
    cfg.colors.Top = g.color;
    try {
      if (!g.avatar) {
        const a = await Avatar.create();
        if (!this.guests.has(g.link)) return; // se fue mientras cargaba
        g.avatar = a;
        await a.apply(cfg);
        g.player.attachAvatar(a);
      } else await g.avatar.apply(cfg);
    } catch (e) { console.warn('coop: avatar del invitado no disponible', e); }
  }

  /** Junto al anfitrión, en un hueco libre de obstáculos (si no, en su mismo sitio, que seguro que lo está). */
  private spawnPoint(): [number, number] {
    const p = this.host.position;
    for (let i = 0; i < 12; i++) {
      const a = this.guests.size * 1.3 + i * 0.9, r = 1.6 + (i > 5 ? 1 : 0);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (this.obstacles.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + 0.5)) return [x, z];
    }
    return [p.x, p.z];
  }

  private leave(link: Link<PadMsg, HostMsg>) {
    const g = this.guests.get(link);
    if (!g) return;
    this.guests.delete(link);
    this.scene.remove(g.player.group);
    (g.tag.material as THREE.SpriteMaterial).map?.dispose();
    this.refresh();
    this.status(`${g.name} ha salido`);
  }

  private kick(g: Guest) {
    g.link.send({ t: 'fuera' });
    setTimeout(() => g.link.close(), 200);
    this.leave(g.link);
  }

  private refresh() {
    const list = this.panel.querySelector('.coop-list')!;
    list.replaceChildren(...[...this.guests.values()].map((g) => {
      const li = document.createElement('li');
      li.innerHTML = `<i style="background:${g.color}"></i><span></span><button>Echar</button>`;
      li.querySelector('span')!.textContent = `J${g.n + 1} · ${g.name}`;
      li.querySelector('button')!.addEventListener('click', () => this.kick(g));
      return li;
    }));
    const badge = this.btn.querySelector('.coop-n') as HTMLElement;
    badge.hidden = this.guests.size === 0;
    badge.textContent = String(this.guests.size);
    this.onChange(this.guests.size);
  }

  /** Mueve a los invitados. `yaw` es el giro de la cámara: todos ven la misma pantalla, así que "arriba" es lo mismo para todos. */
  update(dt: number, t: number, yaw: number) {
    const now = performance.now();
    for (const g of this.guests.values()) {
      if (now - g.seen > TIMEOUT_MS) { g.link.close(); continue; }
      if (now - g.seen > 1000) g.controls.stop(); // el mando se ha dormido: que no siga andando solo
      g.controls.yaw = yaw;
      g.player.update(dt, g.controls, t);
      const state = `${g.controls.crouch ? 1 : 0}${g.player.swimming ? 1 : 0}`;
      if (state !== g.lastState) { g.lastState = state; g.link.send({ t: 'estado', crouch: g.controls.crouch, swim: g.player.swimming }); }
    }
  }

  /** Punto al que mira la cámara: el centro del grupo (o el anfitrión si juega solo). Actualiza `spread`. */
  focus(pp: THREE.Vector3): THREE.Vector3 {
    if (!this.guests.size) { this.spread += (0 - this.spread) * 0.1; return this.fp.copy(pp); }
    let x = pp.x, y = pp.y, z = pp.z, n = 1;
    for (const g of this.guests.values()) { const p = g.player.group.position; x += p.x; y += p.y; z += p.z; n++; }
    x /= n; y /= n; z /= n;
    let far = 0;
    for (const g of this.guests.values()) far = Math.max(far, Math.hypot(g.player.group.position.x - x, g.player.group.position.z - z));
    far = Math.max(far, Math.hypot(pp.x - x, pp.z - z));
    this.spread += (Math.min(16, far * 1.1) - this.spread) * 0.1;
    // el anfitrión manda: la cámara se queda a medio camino entre él y el centro del grupo
    return this.fp.set((x + pp.x) / 2, (y + pp.y) / 2, (z + pp.z) / 2);
  }
}
