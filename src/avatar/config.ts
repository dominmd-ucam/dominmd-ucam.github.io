/**
 * Catálogo del avatar. Basado en r3f-ultimate-character-configurator de Wawa Sensei (https://github.com/wass08/r3f-ultimate-character-configurator):
 * piezas GLB intercambiables que comparten un esqueleto Mixamo. El original lee el catálogo de PocketBase; aquí es estático.
 */
const n = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}.${String(i + 1).padStart(3, '0')}`);

export const SKIN_COLORS = ['#fbe0cf', '#f5c6a5', '#e8b090', '#d99b73', '#c58a60', '#a56b43', '#8a5a3a', '#6b4429', '#4a2e1b'];
export const HAIR_COLORS = ['#1b1b1b', '#3b2a20', '#6b4a2f', '#a56b3c', '#d9a05b', '#f2d58a', '#d8d8d8', '#ff7a59', '#4cc9f0', '#b388ff', '#ff9ac1', '#4fbf6a'];
export const CLOTH_COLORS = ['#ff7a59', '#ffc857', '#4fbf6a', '#4cc9f0', '#2b6fd6', '#b388ff', '#ff9ac1', '#f4f1e8', '#2b3a55', '#e0533d'];

export interface Category {
  name: string;
  label: string;
  files: string[];
  removable: boolean;
  colors?: string[];
  /** Material "Skin_" compartido: el color elige el tono de piel de todo el cuerpo. */
  skin?: boolean;
  /** índice de la pieza inicial (null = vacío) */
  start: number | null;
}

// Piezas que, al ponerse, ocultan otras categorías (p. ej. un disfraz tapa camiseta y pantalón).
export const LOCKS: Record<string, string[]> = {
  'Outfit.001': ['Top', 'Bottom'], 'Outfit.002': ['Top', 'Bottom'], 'Outfit.003': ['Top', 'Bottom'], 'Outfit.004': ['Top', 'Bottom'],
  WawaDress: ['Top', 'Bottom'],
  PumpkinHead: ['Head', 'Hair', 'Eyes', 'EyeBrow', 'Nose', 'FacialHair', 'Face', 'Glasses', 'Earring', 'Bow'],
};

export const CATEGORIES: Category[] = [
  { name: 'Head', label: 'Cabeza', files: n('Head', 4), removable: false, colors: SKIN_COLORS, skin: true, start: 0 },
  { name: 'Eyes', label: 'Ojos', files: n('Eyes', 12), removable: false, start: 0 },
  { name: 'EyeBrow', label: 'Cejas', files: n('EyeBrow', 10), removable: true, colors: HAIR_COLORS, start: 0 },
  { name: 'Nose', label: 'Nariz', files: n('Nose', 4), removable: false, start: 0 },
  { name: 'Hair', label: 'Pelo', files: n('Hair', 11), removable: true, colors: HAIR_COLORS, start: 0 },
  { name: 'FacialHair', label: 'Barba', files: n('FacialHair', 7), removable: true, colors: HAIR_COLORS, start: null },
  { name: 'Face', label: 'Pintura', files: n('Face', 7), removable: true, start: null },
  { name: 'Glasses', label: 'Gafas', files: n('Glasses', 4), removable: true, colors: CLOTH_COLORS, start: null },
  { name: 'Earring', label: 'Pendientes', files: n('Earring', 6), removable: true, start: null },
  { name: 'Hat', label: 'Sombrero', files: [...n('Hat', 7), 'PumpkinHead'], removable: true, start: null },
  { name: 'Top', label: 'Camiseta', files: n('Top', 3), removable: true, colors: CLOTH_COLORS, start: 0 },
  { name: 'Bottom', label: 'Pantalón', files: n('Bottom', 3), removable: true, colors: CLOTH_COLORS, start: 0 },
  { name: 'Shoes', label: 'Zapatos', files: n('Shoes', 3), removable: true, colors: CLOTH_COLORS, start: 2 },
  { name: 'Bow', label: 'Lazo', files: n('Bow', 2), removable: true, colors: CLOTH_COLORS, start: null },
  { name: 'Outfit', label: 'Disfraz', files: [...n('Outfit', 4), 'WawaDress'], removable: true, start: null },
];

export interface AvatarConfig {
  /** categoría → índice de pieza (null = sin pieza) */
  parts: Record<string, number | null>;
  /** categoría → color hex */
  colors: Record<string, string>;
}

export function defaultConfig(): AvatarConfig {
  const parts: AvatarConfig['parts'] = {}, colors: AvatarConfig['colors'] = {};
  for (const c of CATEGORIES) {
    parts[c.name] = c.start;
    if (c.colors) colors[c.name] = c.colors[c.name === 'Top' ? 0 : c.name === 'Bottom' ? 7 : 0];
  }
  return { parts, colors };
}

export function randomConfig(): AvatarConfig {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const cfg = defaultConfig();
  for (const c of CATEGORIES) {
    cfg.parts[c.name] = c.removable && Math.random() < (c.start === null ? 0.7 : 0.15) ? null : Math.floor(Math.random() * c.files.length);
    if (c.colors) cfg.colors[c.name] = pick(c.colors);
  }
  cfg.parts.Outfit = Math.random() < 0.2 ? Math.floor(Math.random() * 5) : null;
  return cfg;
}

const KEY = 'portfolio-avatar-v1';
export function loadConfig(): AvatarConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AvatarConfig | null;
    if (raw?.parts && raw.colors) return { parts: { ...defaultConfig().parts, ...raw.parts }, colors: { ...defaultConfig().colors, ...raw.colors } };
  } catch { /* sin almacenamiento */ }
  return defaultConfig();
}
/** ¿Hay un avatar guardado? (si no, es la primera visita y se enseña el selector de personaje) */
export function hasSavedConfig(): boolean {
  try { return localStorage.getItem(KEY) !== null; } catch { return false; }
}
export function saveConfig(cfg: AvatarConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ignorar */ }
}
