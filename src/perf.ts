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

/**
 * Contador de FPS (Ajustes → MOSTRAR FPS, F3 o ?debug). Cada medio segundo muestra:
 * fps reales (fotogramas dibujados), tiempo medio y peor fotograma, cuánto de ese tiempo es JavaScript (CPU)
 * y, debajo, nivel de gráficos, motor, resolución, llamadas de dibujo y triángulos del último fotograma.
 * Si la CPU es mucho menor que el tiempo del fotograma, lo que limita es la tarjeta gráfica.
 */
export class FpsOverlay {
  private el = document.getElementById('debug') as HTMLElement;
  private n = 0;
  private cpu = 0;
  private worst = 0;
  private start = 0;
  private prev = 0;
  /** ?debug lo enciende sin tocar los ajustes */
  private forced = new URLSearchParams(location.search).has('debug');

  constructor(private label: string, private t: (es: string, en: string) => string) {}

  set enabled(on: boolean) {
    const show = on || this.forced;
    if (show === !this.el.hidden) return;
    this.el.hidden = !show;
    this.n = 0; this.prev = 0;
    if (show) this.el.textContent = '… fps';
  }

  get visible() { return !this.el.hidden; }

  /** se llama tras dibujar cada fotograma; `cpuMs`: lo que ha tardado el fotograma en JavaScript */
  update(now: number, cpuMs: number, gfx: Gfx, dpr: number) {
    if (this.el.hidden) return;
    if (this.prev) { this.worst = Math.max(this.worst, now - this.prev); this.n++; this.cpu += cpuMs; }
    else { this.start = now; this.worst = 0; this.cpu = 0; this.n = 0; }
    this.prev = now;
    const span = now - this.start;
    if (span < 500 || !this.n) return;
    const i = gfx.stats(), t = this.t;
    const ms = span / this.n;
    this.el.innerHTML = `<b>${1000 / ms < 10 ? (1000 / ms).toFixed(1) : Math.round(1000 / ms)}</b> fps\n${ms.toFixed(1)} ms · ${t('peor', 'worst')} ${this.worst.toFixed(0)} · CPU ${(this.cpu / this.n).toFixed(1)}\n${this.label} · ${gfx.kind === 'webgpu' ? 'WebGPU' : 'WebGL'} · ${t('res', 'res')} ${dpr.toFixed(2)}\n${i.calls} ${t('llamadas', 'draws')} · ${(i.triangles / 1000).toFixed(0)}k ${t('triáng.', 'tris')}`;
    this.start = now; this.n = 0; this.cpu = 0; this.worst = 0;
  }
}
