export type Resolution = 'auto' | 'high' | 'medium' | 'low';

export interface Settings {
  sound: boolean;
  /** 0–8 */
  volume: number;
  shadows: boolean;
  effects: boolean;
  /** ver a otros visitantes conectados */
  ghosts: boolean;
  resolution: Resolution;
  /** 0 cerca, 1 media, 2 lejos */
  camera: number;
}

export const CAMERA_DIST = [5.5, 8.5, 13];
export const RESOLUTIONS: Resolution[] = ['auto', 'high', 'medium', 'low'];
export const RESOLUTION_LABEL: Record<Resolution, string> = { auto: 'AUTO', high: 'ALTA', medium: 'MEDIA', low: 'BAJA' };

const KEY = 'portfolio-settings-v1';
const defaults: Settings = { sound: true, volume: 6, shadows: true, effects: true, ghosts: true, resolution: 'auto', camera: 1 };

type Listener = (s: Settings, key: keyof Settings) => void;

class Store {
  value: Settings = { ...defaults };
  private listeners: Listener[] = [];

  constructor() {
    try { Object.assign(this.value, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* sin almacenamiento */ }
  }

  set<K extends keyof Settings>(key: K, v: Settings[K]) {
    this.value[key] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.value)); } catch { /* ignorar */ }
    for (const l of this.listeners) l(this.value, key);
  }

  onChange(l: Listener) { this.listeners.push(l); }
}

export const settings = new Store();
