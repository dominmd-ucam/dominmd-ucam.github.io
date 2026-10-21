export type Tier = 'low' | 'med' | 'high';

/** `mobile`: pantalla táctil o estrecha. Ajusta la calidad media al presupuesto de un móvil (sombra, hierba y postprocesado más ligeros). */
export interface Quality { tier: Tier; dpr: number; shadowMap: number; shadows: boolean; mobile: boolean }

/** ?q=low|med|high fuerza un nivel; si no, se estima por dispositivo. */
export function detectQuality(): Quality {
  const forced = new URLSearchParams(location.search).get('q') as Tier | null;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  const tier: Tier = forced && ['low', 'med', 'high'].includes(forced) ? forced : mobile ? 'med' : cores >= 8 ? 'high' : 'med';
  const dpr = Math.min(devicePixelRatio || 1, tier === 'high' ? 2 : tier === 'med' ? 1.5 : 1);
  const shadowMap = tier === 'high' ? 4096 : tier === 'med' && !mobile ? 2048 : 1024;
  return { tier, dpr, shadowMap, shadows: tier !== 'low', mobile };
}
