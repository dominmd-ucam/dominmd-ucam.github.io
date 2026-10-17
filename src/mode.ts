/** Modo de visita recordado: 'game' (isla 3D) o 'classic' (HTML). */
export type Mode = 'game' | 'classic';
const KEY = 'portfolio-mode-v1';

export function storedMode(): Mode | null {
  try { const v = localStorage.getItem(KEY); return v === 'game' || v === 'classic' ? v : null; } catch { return null; }
}
export function rememberMode(m: Mode) {
  try { localStorage.setItem(KEY, m); } catch { /* sin almacenamiento */ }
}

/** Vuelve a la versión clásica (recarga la página sin el juego). */
export function goClassic() {
  rememberMode('classic');
  const u = new URL(location.href);
  u.search = '?modo=clasico';
  u.hash = '';
  location.href = u.toString();
}

/** ¿Puede este dispositivo ejecutar la isla con garantías? */
export function gameSupport(): { ok: boolean; reason?: string } {
  try {
    const c = document.createElement('canvas');
    if (!c.getContext('webgl2')) return { ok: false, reason: 'Tu navegador no admite WebGL 2, necesario para la isla 3D.' };
  } catch { return { ok: false, reason: 'No se pudo iniciar WebGL en este dispositivo.' }; }
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return { ok: true, reason: 'Tienes activado el ahorro de datos: la isla descarga unos 15 MB.' };
  return { ok: true };
}
