/** Zona muerta del stick/mando: por debajo de `DEAD` no se mueve y a partir de ahí se reescala a 0–1 (sin salto brusco al empezar). */
export const DEAD = 0.12;
export function applyDeadzone(v: { x: number; y: number }): void {
  const len = Math.hypot(v.x, v.y);
  if (len < DEAD) { v.x = 0; v.y = 0; return; }
  const k = (Math.min(1, len) - DEAD) / (1 - DEAD) / len;
  v.x *= k; v.y *= k;
}
