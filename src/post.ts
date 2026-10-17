import * as THREE from 'three';
import { BloomEffect, BrightnessContrastEffect, Effect, HueSaturationEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import type { Quality } from './quality';

/** Multiplica el color por una exposición ajustable (el ciclo día/noche la mueve). */
class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', 'uniform float exposure; void mainImage(const in vec4 i, const in vec2 uv, out vec4 o){ o = vec4(i.rgb * exposure, i.a); }',
      { uniforms: new Map<string, THREE.Uniform>([['exposure', new THREE.Uniform(0.6)]]) });
  }
  set exposure(v: number) { (this.uniforms.get('exposure') as THREE.Uniform).value = v; }
}

export interface Post {
  render(dt: number): void;
  setSize(w: number, h: number): void;
  setExposure(v: number): void;
  /** activa o desactiva bloom, viñeta y antialiasing (a nivel bajo siempre está desactivado) */
  setEnabled(on: boolean): void;
}

/** Nivel bajo: render directo con el tone mapping nativo. Medio/alto: bloom, viñeta y SMAA. */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: Quality): Post {
  if (q.tier === 'low') {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    return {
      render: () => renderer.render(scene, camera),
      setSize: () => {},
      setExposure: (v) => { renderer.toneMappingExposure = v; },
      setEnabled: () => {},
    };
  }
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  const exposure = new ExposureEffect();
  const bloom = new BloomEffect({ intensity: 0.4, luminanceThreshold: 1.15, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  composer.addPass(new EffectPass(camera, exposure, bloom, tone, new HueSaturationEffect({ saturation: 0.34 }), new BrightnessContrastEffect({ contrast: 0.12 }), new VignetteEffect({ offset: 0.35, darkness: 0.28 })));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));
  let enabled = true, expo = 0.5;
  return {
    render: (dt) => {
      if (enabled) { renderer.toneMapping = THREE.NoToneMapping; composer.render(dt); }
      else { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = expo * 1.1; renderer.render(scene, camera); }
    },
    setSize: (w, h) => composer.setSize(w, h, false),
    setExposure: (v) => { expo = v; exposure.exposure = v; },
    setEnabled: (on) => { enabled = on; },
  };
}
