import * as THREE from 'three';
import { BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
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
}

/** Nivel bajo: render directo con el tone mapping nativo. Medio/alto: bloom, viñeta y SMAA. */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: Quality): Post {
  if (q.tier === 'low') {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    return {
      render: () => renderer.render(scene, camera),
      setSize: () => {},
      setExposure: (v) => { renderer.toneMappingExposure = v; },
    };
  }
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  const exposure = new ExposureEffect();
  const bloom = new BloomEffect({ intensity: 0.4, luminanceThreshold: 1.15, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  composer.addPass(new EffectPass(camera, exposure, bloom, tone, new VignetteEffect({ offset: 0.3, darkness: 0.45 })));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));
  return {
    render: (dt) => composer.render(dt),
    setSize: (w, h) => composer.setSize(w, h, false),
    setExposure: (v) => { exposure.exposure = v; },
  };
}
