import './shared.css';
import './classic.css';
import projects from './data/projects.json';
import { ProjectModal, type ProjectLike } from './ui/projectModal';
import { gameSupport, rememberMode, storedMode } from './mode';

/**
 * Punto de entrada: la versión clásica ya viene en el HTML (indexable y rápida).
 * Aquí solo se conectan los botones y se carga el juego bajo demanda (import dinámico).
 */
const modal = ProjectModal.get();
const byId = new Map((projects as unknown as ProjectLike[]).map((p) => [p.id, p]));

document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-project]');
  if (!t) return;
  const p = byId.get(t.dataset.project ?? '');
  if (p) modal.open(p);
});

// filtros de la lista de proyectos
document.addEventListener('click', (e) => {
  const f = (e.target as HTMLElement).closest<HTMLElement>('[data-filter]');
  if (!f) return;
  const type = f.dataset.filter ?? 'all';
  document.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) => b.classList.toggle('on', b === f));
  document.querySelectorAll<HTMLElement>('.card[data-type]').forEach((c) => { c.hidden = type !== 'all' && c.dataset.type !== type; });
});

const support = gameSupport();
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-enter3d]')];
const note = document.querySelector<HTMLElement>('[data-gate-note]');
if (!support.ok) {
  buttons.forEach((b) => { b.disabled = true; b.title = support.reason ?? ''; });
  if (note) { note.hidden = false; note.textContent = support.reason ?? ''; }
} else if (support.reason && note) {
  note.hidden = false; note.textContent = support.reason;
}

let starting = false;
async function startGame() {
  if (starting || !support.ok) return;
  starting = true;
  rememberMode('game');
  const veil = document.createElement('div');
  veil.id = 'entering';
  veil.innerHTML = '<div>Entrando en la isla…<small>Descargando el mundo 3D</small></div>';
  document.body.append(veil);
  try {
    document.getElementById('classic')?.setAttribute('hidden', '');
    document.getElementById('game')?.removeAttribute('hidden');
    const game = await import('./game');
    game.start();
    veil.remove();
  } catch (err) {
    console.error('No se pudo iniciar el juego', err);
    veil.remove();
    document.getElementById('game')?.setAttribute('hidden', '');
    document.getElementById('classic')?.removeAttribute('hidden');
    starting = false;
    if (note) { note.hidden = false; note.textContent = 'No se pudo cargar la isla 3D. Puedes seguir con la versión clásica.'; }
  }
}
buttons.forEach((b) => b.addEventListener('click', () => void startGame()));

// ¿Entramos directamente? ?modo=3d o #isla, o la última elección si el dispositivo lo permite
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const want = params.get('modo') === '3d' || location.hash === '#isla' || (params.get('modo') !== 'clasico' && storedMode() === 'game' && !reduced);
if (want && support.ok) void startGame();
