/** Dirección de la API (se fija al compilar con VITE_API_URL). Sin ella, el libro de visitas, el contacto y los fantasmas no aparecen. */
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim().replace(/\/$/, '');

export const apiConfigured = BASE !== '';

export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiConfigured) throw new ApiError('API no configurada');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } }); // sin cuerpo (GET) no hay cabecera personalizada → sin preflight CORS
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status === 429 ? 'Has enviado demasiados mensajes. Inténtalo más tarde.' : data.error ?? 'No se pudo completar la acción.', res.status);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('El servidor no responde ahora mismo. Inténtalo de nuevo en un rato.');
  } finally {
    clearTimeout(timer);
  }
}

export interface GuestEntry { id: number; name: string; message: string; createdAt: number }

export const getGuestbook = () => call<{ entries: GuestEntry[] }>('/api/guestbook').then((r) => r.entries);
export const postGuestbook = (b: { name: string; message: string; website?: string }) => call<{ ok: boolean }>('/api/guestbook', { method: 'POST', body: JSON.stringify(b) });
export const postContact = (b: { name: string; email?: string; message: string; website?: string }) => call<{ ok: boolean }>('/api/contact', { method: 'POST', body: JSON.stringify(b) });

/** Dirección del WebSocket de presencia, o null si no hay API. */
export function presenceUrl(): string | null {
  if (!apiConfigured) return null;
  return `${BASE.replace(/^http/, 'ws')}/ws/presence`;
}

const NAME_KEY = 'portfolio-visitor-name';
export function visitorName(): string { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } }
export function rememberVisitorName(n: string) { try { localStorage.setItem(NAME_KEY, n.slice(0, 20)); } catch { /* sin almacenamiento */ } }
