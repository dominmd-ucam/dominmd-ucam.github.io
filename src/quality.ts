import { settings, type Graphics } from './settings';

export type Tier = 'low' | 'med' | 'high';

/**
 * `mobile`: pantalla táctil o estrecha. Ajusta la calidad media al presupuesto de un móvil (sombra, hierba y postprocesado más ligeros).
 * `ultra`: nivel por encima de alto (para PC con buena gráfica). Internamente es `tier: 'high'` con más densidad y distancia.
 * `density`: multiplicador de árboles y sotobosque (1 = medio). `view`: distancia (m) hasta la que se dibujan árboles y plantas.
 */
export interface Quality { tier: Tier; dpr: number; shadowMap: number; shadows: boolean; mobile: boolean; ultra: boolean; density: number; view: number }

/** ?q=low|med|high|ultra fuerza un nivel; si no, el de Ajustes → GRÁFICOS; en AUTO se estima por dispositivo. */
export function detectQuality(): Quality {
  const forced = new URLSearchParams(location.search).get('q') as Graphics | null;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  const pick: Graphics = forced && GRAPHICS.includes(forced) ? forced : settings.value.graphics;
  const level: Exclude<Graphics, 'auto'> = pick !== 'auto' ? pick : mobile ? 'med' : cores >= 8 ? 'high' : 'med';
  const ultra = level === 'ultra';
  const tier: Tier = ultra ? 'high' : level;
  const dpr = Math.min(devicePixelRatio || 1, tier === 'high' ? 2 : tier === 'med' ? (mobile ? 1.25 : 1.5) : 1); // móvil medio: 1,25 ahorra ~30 % de píxeles frente a 1,5 con casi igual nitidez en pantalla pequeña
  const shadowMap = tier === 'high' ? 4096 : tier === 'med' && !mobile ? 2048 : 1024;
  const density = ultra ? 1.6 : tier === 'high' ? 1.3 : tier === 'med' ? (mobile ? 0.9 : 1.1) : 0.6;
  const view = ultra ? 400 : tier === 'high' ? 220 : tier === 'med' ? (mobile ? 120 : 170) : 90;
  return { tier, dpr, shadowMap, shadows: tier !== 'low', mobile, ultra, density, view };
}
export const GRAPHICS: Graphics[] = ['auto', 'low', 'med', 'high', 'ultra'];
export const GRAPHICS_LABEL: Record<Graphics, string> = { auto: 'AUTO', low: 'BAJOS', med: 'MEDIOS', high: 'ALTOS', ultra: 'ULTRA' };
