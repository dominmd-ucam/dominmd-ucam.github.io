export type Tier = 'low' | 'med' | 'high';

export interface Quality { tier: Tier; dpr: number; shadowMap: number; shadows: boolean }

/** ?q=low|med|high fuerza un nivel; si no, se estima por dispositivo. */
export function detectQuality(): Quality {
  const forced = new URLSearchParams(location.search).get('q') as Tier | null;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  const tier: Tier = forced && ['low', 'med', 'high'].includes(forced) ? forced : mobile ? 'med' : cores >= 8 ? 'high' : 'med';
  const dpr = Math.min(devicePixelRatio || 1, tier === 'high' ? 2 : tier === 'med' ? 1.5 : 1);
  return { tier, dpr, shadowMap: tier === 'high' ? 4096 : tier === 'med' ? 2048 : 1024, shadows: tier !== 'low' };
}
