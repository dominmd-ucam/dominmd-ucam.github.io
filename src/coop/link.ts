/**
 * Canal entre el PC (anfitrión) y los móviles (mandos). GitHub Pages no tiene servidor, así que se usa WebRTC con la
 * señalización gratuita de PeerJS (0.peerjs.com): el broker solo presenta a los dos navegadores y después los datos van directos.
 * Con ?enlace=local se usa un BroadcastChannel (pestañas del mismo navegador): sirve para probar sin red.
 */

/** Mensajes del mando al PC. `j` y `k` son contadores: el PC salta o se agacha cuando cambian (no se pierden pulsaciones). */
export type PadMsg =
  | { t: 'hola'; name: string; color: string }
  | { t: 'in'; x: number; y: number; s: boolean; j: number; k: number }
  | { t: 'look' }
  | { t: 'adios' };
/** Mensajes del PC al mando. */
export type HostMsg =
  | { t: 'dentro'; n: number; color: string }
  | { t: 'lleno' }
  | { t: 'fuera' }
  | { t: 'estado'; crouch: boolean; swim: boolean };

export interface Link<In, Out> {
  send(m: Out): void;
  close(): void;
  onMessage: (m: In) => void;
  onClose: () => void;
}
export interface Room {
  code: string;
  onJoin: (l: Link<PadMsg, HostMsg>) => void;
  /** un móvil encontró la sala pero no se pudo abrir el canal directo */
  onFail: () => void;
  /** la sala se perdió en el broker: hay que abrir otra (con otro QR) */
  onLost: () => void;
  close(): void;
}
export type LinkKind = 'peer' | 'local';

const ID_PREFIX = 'playa-dmn-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L: se puede dictar
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALPHABET[b % ALPHABET.length]).join('');
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function link<In, Out>(send: (m: Out) => void, close: () => void): Link<In, Out> {
  const l: Link<In, Out> = { send, close: () => { close(); l.onClose(); }, onMessage: () => {}, onClose: () => {} };
  return l;
}

/* ---------- PeerJS ---------- */

/** Por qué no se pudo entrar: cada caso tiene su consejo en el mando. */
export type JoinFail = 'broker' | 'missing' | 'p2p';
export class JoinError extends Error {
  constructor(readonly why: JoinFail) { super(why); }
}

/**
 * Servidores para atravesar el router. STUN basta cuando el móvil y el PC están en la misma wifi o en redes caseras;
 * con datos móviles (CGNAT) o redes de universidad hace falta un relevo TURN. El TURN gratuito que trae PeerJS
 * (eu-0/us-0.turn.peerjs.com) no responde desde nov. 2026, así que no se usa: solo retrasaba la conexión.
 * Relevo: TURN de Metered (cuenta gratuita de Domingo, credenciales estáticas pensadas para el navegador; quedan
 * públicas en la web igualmente). Se pueden cambiar al compilar sin tocar código (ver README):
 * VITE_TURN_URLS + VITE_TURN_USER + VITE_TURN_PASS, o VITE_TURN_API, una dirección que devuelve los iceServers en JSON.
 */
const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const env = import.meta.env as Record<string, string | undefined>;
const METERED = {
  urls: 'turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp',
  user: '79e4757489734226c1a4e63e',
  pass: 'dn+6JFK0h4eS/IZ9',
};
const custom = !!env.VITE_TURN_URLS?.trim();
const TURN_URLS = (custom ? env.VITE_TURN_URLS! : METERED.urls).split(',').map((u) => u.trim()).filter(Boolean);
const TURN_USER = custom ? env.VITE_TURN_USER ?? '' : METERED.user;
const TURN_PASS = custom ? env.VITE_TURN_PASS ?? '' : METERED.pass;
const TURN_API = (env.VITE_TURN_API ?? '').trim();
/** hay relevo configurado: si no, el mando aconseja usar la misma wifi */
export const hasRelay = TURN_URLS.length > 0 || !!TURN_API;

let iceCache: Promise<RTCIceServer[]> | null = null;
function iceServers(): Promise<RTCIceServer[]> {
  return (iceCache ??= (async () => {
    const list = [...STUN];
    if (TURN_URLS.length) list.push({ urls: TURN_URLS, username: TURN_USER, credential: TURN_PASS });
    if (TURN_API) {
      try {
        const r = await fetch(TURN_API, { signal: AbortSignal.timeout(5000) });
        const got = (await r.json()) as RTCIceServer[];
        if (Array.isArray(got)) list.push(...got.filter((s) => s && s.urls));
      } catch (e) { console.warn('coop: no se pudo pedir el TURN', e); }
    }
    return list;
  })());
}

async function newPeer(id?: string) {
  const { Peer } = await import('peerjs');
  const config = { iceServers: await iceServers() };
  return id ? new Peer(id, { debug: 1, config }) : new Peer({ debug: 1, config });
}

/** Fallos del broker que se arreglan solos reconectando; el resto se da por perdido. */
const BROKER_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed']);

async function peerRoom(code: string): Promise<Room> {
  const peer = await newPeer(ID_PREFIX + code);
  await new Promise<void>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('El servidor de enlace no responde')), 12000);
    peer.once('open', () => { clearTimeout(timer); ok(); });
    peer.once('error', (e) => { clearTimeout(timer); fail(e); });
  }).catch((e) => { peer.destroy(); throw e; });
  const room: Room = { code, onJoin: () => {}, onFail: () => {}, onLost: () => {}, close: () => { closed = true; peer.destroy(); } };
  let closed = false, tries = 0, retry = 0;
  /* si se cae la conexión con el broker (wifi que parpadea, PC que suspende la pestaña), los mandos conectados siguen
     funcionando, pero los nuevos no encontrarían la sala: se reintenta con espera creciente y al volver a la pestaña */
  const reconnect = () => {
    clearTimeout(retry);
    if (closed || peer.destroyed || !peer.disconnected) return;
    peer.reconnect();
    retry = window.setTimeout(reconnect, Math.min(30000, 2000 * 2 ** tries++));
  };
  peer.on('disconnected', () => { retry = window.setTimeout(reconnect, 1500); });
  peer.on('open', () => { tries = 0; clearTimeout(retry); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reconnect(); });
  peer.on('error', (e) => {
    console.warn('coop:', e.type, e);
    if (closed) return;
    // otro navegador se ha quedado con el código, o el broker ha cerrado la sesión: hay que abrir otra sala
    if (e.type === 'unavailable-id' || (peer.destroyed && !BROKER_ERRORS.has(e.type))) { closed = true; peer.destroy(); room.onLost(); }
  });
  peer.on('close', () => { if (!closed) { closed = true; room.onLost(); } });
  peer.on('connection', (conn) => {
    let opened = false;
    const failed = () => { if (!opened) { opened = true; room.onFail(); } };
    const timer = setTimeout(() => { failed(); conn.close(); }, 20000);
    conn.on('iceStateChanged', (s) => { if (s === 'failed') failed(); });
    conn.on('error', failed);
    conn.on('open', () => {
      clearTimeout(timer);
      if (opened) return;
      opened = true;
      const l = link<PadMsg, HostMsg>((m) => { if (conn.open) void conn.send(m); }, () => conn.close());
      conn.on('data', (d) => l.onMessage(d as PadMsg));
      conn.on('close', () => l.onClose());
      conn.on('error', () => l.onClose());
      room.onJoin(l);
    });
  });
  return room;
}

/**
 * Entra en la sala desde el móvil. Distingue los tres fallos posibles para dar un consejo útil:
 * sin broker (el móvil no tiene internet), sala inexistente (el PC cerró o recargó) y conexión directa imposible (red).
 */
async function peerJoin(code: string): Promise<Link<HostMsg, PadMsg>> {
  const peer = await newPeer();
  return new Promise((ok, fail) => {
    let done = false, phase: 'broker' | 'p2p' = 'broker';
    const give = (why: JoinFail) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); fail(new JoinError(why)); };
    // 10 s para llegar al broker; luego 20 s para que el PC conteste y se abra el canal (con relevo puede tardar)
    let timer = setTimeout(() => give('broker'), 10000);
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') give('missing');
      else if (phase === 'broker' || BROKER_ERRORS.has(e.type)) give(phase === 'broker' ? 'broker' : 'p2p');
    });
    peer.once('open', () => {
      phase = 'p2p';
      clearTimeout(timer);
      timer = setTimeout(() => give('p2p'), 20000);
      const conn = peer.connect(ID_PREFIX + code, { serialization: 'json', reliable: true });
      conn.on('iceStateChanged', (s) => { if (s === 'failed') give('p2p'); });
      conn.on('error', () => give('p2p'));
      conn.once('close', () => give('p2p'));
      conn.once('open', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const l = link<HostMsg, PadMsg>((m) => { if (conn.open) void conn.send(m); }, () => { conn.close(); peer.destroy(); });
        conn.on('data', (d) => l.onMessage(d as HostMsg));
        conn.on('close', () => { peer.destroy(); l.onClose(); });
        ok(l);
      });
    });
  });
}

/* ---------- BroadcastChannel (pruebas en el mismo navegador) ---------- */
type Wire = { from: string; to: string; m?: unknown; bye?: true };
function localRoom(code: string): Room {
  const ch = new BroadcastChannel('playa-coop-' + code);
  const links = new Map<string, Link<PadMsg, HostMsg>>();
  const room: Room = { code, onJoin: () => {}, onFail: () => {}, onLost: () => {}, close: () => { for (const l of links.values()) l.close(); ch.close(); } };
  ch.onmessage = (e: MessageEvent<Wire>) => {
    const w = e.data;
    if (w.to !== 'host') return;
    let l = links.get(w.from);
    if (w.bye) { if (l) { links.delete(w.from); l.onClose(); } return; }
    if (!l) {
      const id = w.from;
      l = link<PadMsg, HostMsg>((m) => ch.postMessage({ from: 'host', to: id, m } satisfies Wire), () => { links.delete(id); ch.postMessage({ from: 'host', to: id, bye: true } satisfies Wire); });
      links.set(id, l);
      room.onJoin(l);
    }
    l.onMessage(w.m as PadMsg);
  };
  return room;
}
function localJoin(code: string): Link<HostMsg, PadMsg> {
  const ch = new BroadcastChannel('playa-coop-' + code);
  const id = Math.random().toString(36).slice(2);
  const l = link<HostMsg, PadMsg>((m) => ch.postMessage({ from: id, to: 'host', m } satisfies Wire), () => { ch.postMessage({ from: id, to: 'host', bye: true } satisfies Wire); ch.close(); });
  ch.onmessage = (e: MessageEvent<Wire>) => {
    const w = e.data;
    if (w.to !== id) return;
    if (w.bye) { ch.close(); l.onClose(); } else l.onMessage(w.m as HostMsg);
  };
  return l;
}

/** Abre la sala en el PC. Si el código ya está ocupado en el broker, prueba con otro. */
export async function openRoom(kind: LinkKind, code: string): Promise<Room> {
  if (kind === 'local') return localRoom(code);
  try { return await peerRoom(code); }
  catch (e) {
    if ((e as { type?: string }).type === 'unavailable-id') return peerRoom(newCode());
    throw e;
  }
}

export async function joinRoom(kind: LinkKind, code: string): Promise<Link<HostMsg, PadMsg>> {
  return kind === 'local' ? localJoin(code) : peerJoin(code);
}
