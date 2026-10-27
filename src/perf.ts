import type { Gfx } from './gfx';

/**
 * Resolución adaptativa: si los fotogramas tardan demasiado baja el factor de píxeles (poco a poco y con histéresis)
 * y lo sube de nuevo cuando hay margen. Es la mejora de rendimiento más notable en móviles y portátiles modestos.
 */
export class AdaptiveRes {
  private ema = 16.7;
  private cooldown = 3000;
  dpr: number;

  constructor(public max: number, private min: number, private apply: (dpr: number) => void) {
    this.dpr = max;
  }

  setMax(max: number) { this.max = max; this.dpr = Math.min(this.dpr, max); this.apply(this.dpr); }
  /** fija una resolución concreta (desactiva la adaptación mientras no se llame a setMax) */
  fix(dpr: number) { this.dpr = dpr; this.apply(dpr); }

  tick(dtMs: number, enabled: boolean) {
    this.ema = this.ema * 0.95 + dtMs * 0.05;
    this.cooldown -= dtMs;
    if (!enabled || this.cooldown > 0) return;
    if (this.ema > 26 && this.dpr > this.min) {
      this.dpr = Math.max(this.min, this.dpr - 0.15);
      this.apply(this.dpr);
      this.cooldown = 2500;
    } else if (this.ema < 17.5 && this.dpr < this.max) {
      this.dpr = Math.min(this.max, this.dpr + 0.1);
      this.apply(this.dpr);
      this.cooldown = 5000;
    }
  }
}

/** Indicador de FPS, llamadas de dibujo y triángulos (se abre con ?debug o con F3). */
export class DebugOverlay {
  private el = document.getElementById('debug') as HTMLElement;
  private n = 0;
  private acc = 0;

  constructor() {
    if (new URLSearchParams(location.search).has('debug')) this.el.hidden = false;
    addEventListener('keydown', (e) => { if (e.key === 'F3') { this.el.hidden = !this.el.hidden; e.preventDefault(); } });
  }

  get visible() { return !this.el.hidden; }

  update(dtMs: number, gfx: Gfx, dpr: number) {
    this.n++; this.acc += dtMs;
    if (this.acc < 500 || this.el.hidden) return;
    const i = gfx.stats();
    this.el.textContent = `${(1000 / (this.acc / this.n)).toFixed(0)} fps · ${gfx.kind === 'webgpu' ? 'WebGPU' : 'WebGL'}\n${i.calls} llamadas · ${(i.triangles / 1000).toFixed(0)}k tris\n${i.geometries} geom · ${i.textures} tex\ndpr ${dpr.toFixed(2)}`;
    this.n = 0; this.acc = 0;
  }
}
