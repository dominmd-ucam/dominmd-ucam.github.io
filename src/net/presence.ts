import { presenceUrl, visitorName } from './api';

export interface PeerRow { id: string; x: number; z: number; r: number; m: number; w: boolean; name: string }

/**
 * Cliente de presencia: envía tu posición unas 8 veces por segundo (solo si cambia) y recibe la de los demás.
 * Se reconecta con retardo creciente y se rinde tras varios intentos: el juego funciona igual sin red.
 */
export class Presence {
  online = 0;
  connected = false;
  onPeers: (rows: PeerRow[], full: boolean) => void = () => {};
  onBye: (id: string) => void = () => {};
  onCount: (n: number) => void = () => {};
  private ws: WebSocket | null = null;
  private tries = 0;
  private wanted = false;
  private timer = 0;
  private lastSent = '';
  private lastAt = 0;

  start() {
    this.wanted = true;
    this.tries = 0;
    this.open();
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.online = 0;
    this.onCount(0);
  }

  private open() {
    const url = presenceUrl();
    if (!url || !this.wanted) return;
    try { this.ws = new WebSocket(url); } catch { return; }
    const ws = this.ws;
    ws.addEventListener('open', () => {
      this.connected = true; this.tries = 0;
      const n = visitorName();
      if (n) ws.send(JSON.stringify({ t: 'n', n }));
    });
    ws.addEventListener('message', (ev) => {
      let m: { t: string; n?: number; p?: unknown[][]; id?: string };
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (typeof m.n === 'number') { this.online = m.n; this.onCount(m.n); }
      if (m.t === 'p' && Array.isArray(m.p)) {
        this.onPeers(m.p.map((r) => ({ id: String(r[0]), x: Number(r[1]), z: Number(r[2]), r: Number(r[3]), m: Number(r[4]), w: r[5] === 1, name: String(r[6] ?? '') })), false);
      } else if (m.t === 'bye' && m.id) this.onBye(m.id);
    });
    const retry = () => {
      this.connected = false;
      if (!this.wanted || ++this.tries > 6) { this.onCount(0); return; }
      this.timer = window.setTimeout(() => this.open(), Math.min(30_000, 1500 * 2 ** this.tries));
    };
    ws.addEventListener('close', retry);
    ws.addEventListener('error', () => ws.close());
  }

  /** Envía la posición si ha cambiado (o como latido cada segundo). */
  send(x: number, z: number, r: number, m: number, w: boolean, now: number) {
    if (!this.connected || this.ws?.readyState !== 1 || now - this.lastAt < 120) return;
    const msg = `${x.toFixed(1)},${z.toFixed(1)},${r.toFixed(2)},${m.toFixed(1)},${w ? 1 : 0}`;
    if (msg === this.lastSent && now - this.lastAt < 1000) return;
    this.lastSent = msg; this.lastAt = now;
    this.ws.send(JSON.stringify({ t: 's', x, z, r, m, w }));
  }
}
