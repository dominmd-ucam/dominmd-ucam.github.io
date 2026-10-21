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
async function peerRoom(code: string): Promise<Room> {
  const { Peer } = await import('peerjs');
  const peer = new Peer(ID_PREFIX + code, { debug: 1 });
  await new Promise<void>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('El servidor de enlace no responde')), 12000);
    peer.once('open', () => { clearTimeout(timer); ok(); });
    peer.once('error', (e) => { clearTimeout(timer); fail(e); });
  });
  // si se cae la conexión con el broker, los mandos ya conectados siguen funcionando; se reintenta para que entren más
  peer.on('disconnected', () => setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 2000));
  peer.on('error', (e) => console.warn('coop:', e.type, e));
  const room: Room = { code, onJoin: () => {}, close: () => peer.destroy() };
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      const l = link<PadMsg, HostMsg>((m) => { if (conn.open) void conn.send(m); }, () => conn.close());
      conn.on('data', (d) => l.onMessage(d as PadMsg));
      conn.on('close', () => l.onClose());
      conn.on('error', () => l.onClose());
      room.onJoin(l);
    });
  });
  return room;
}

async function peerJoin(code: string): Promise<Link<HostMsg, PadMsg>> {
  const { Peer } = await import('peerjs');
  const peer = new Peer({ debug: 1 });
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => { peer.destroy(); fail(new Error('No se encuentra la partida')); }, 15000);
    peer.once('error', (e) => { clearTimeout(timer); peer.destroy(); fail(new Error(e.type === 'peer-unavailable' ? 'La partida ya no existe' : 'Sin conexión')); });
    peer.once('open', () => {
      const conn = peer.connect(ID_PREFIX + code, { serialization: 'json', reliable: true });
      conn.once('open', () => {
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
  const room: Room = { code, onJoin: () => {}, close: () => { for (const l of links.values()) l.close(); ch.close(); } };
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
