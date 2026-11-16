import * as THREE from 'three';
import { BloomEffect, BrightnessContrastEffect, Effect, EffectAttribute, HueSaturationEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import type { Quality } from './quality';
import { GodRaysEffect } from './godrays';

/** Multiplica el color por una exposición ajustable (el ciclo día/noche la mueve). */
class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', 'uniform float exposure; void mainImage(const in vec4 i, const in vec2 uv, out vec4 o){ o = vec4(i.rgb * exposure, i.a); }',
      { uniforms: new Map<string, THREE.Uniform>([['exposure', new THREE.Uniform(0.6)]]) });
  }
  set exposure(v: number) { (this.uniforms.get('exposure') as THREE.Uniform).value = v; }
}

/**
 * Contornos de dibujo animado a partir de la profundidad (sin pasadas de geometría extra).
 * Se usa la laplaciana de 1/z: en una superficie plana 1/z varía de forma lineal en pantalla y da 0, así que solo
 * aparecen las siluetas y los pliegues convexos, y la línea cae del lado del objeto cercano.
 * La línea no es negra: oscurece y enfría el color de debajo (más suave, como en BotW). Se desvanece con la distancia
 * y no se dibuja sobre la hierba (que escribe alfa 0), que si no se llenaría de ruido.
 */
class InkEffect extends Effect {
  constructor() {
    super('InkEffect', /* glsl */ `
      uniform float strength;
      float invZ(const in vec2 uv) { return -1.0 / getViewZ(readDepth(uv)); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        outputColor = vec4(inputColor.rgb, 1.0);
        if (depth >= 1.0 || inputColor.a < 0.5) return;
        float w0 = -1.0 / getViewZ(depth);
        vec2 o = texelSize;
        float lx = 2.0 * w0 - invZ(uv + vec2(o.x, 0.0)) - invZ(uv - vec2(o.x, 0.0));
        float ly = 2.0 * w0 - invZ(uv + vec2(0.0, o.y)) - invZ(uv - vec2(0.0, o.y));
        float z0 = 1.0 / w0;
        float edge = smoothstep(0.04, 0.12, max(lx, ly) / w0) * (1.0 - smoothstep(30.0, 75.0, z0));
        outputColor.rgb = mix(inputColor.rgb, inputColor.rgb * vec3(0.3, 0.28, 0.38), edge * strength);
      }`, { attributes: EffectAttribute.DEPTH, uniforms: new Map<string, THREE.Uniform>([['strength', new THREE.Uniform(0.85)]]) });
  }
}

/**
 * Perspectiva aérea (BotW): lo lejano se funde con el azul del horizonte según la profundidad, antes de los contornos.
 * Más suave que la niebla y solo en la lejanía: las montañas y los bosques del fondo se ven azulados, como en Hyrule.
 */
class AerialEffect extends Effect {
  constructor(strength: number) {
    super('AerialEffect', /* glsl */ `
      uniform vec3 haze;
      uniform float strength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        outputColor = inputColor;
        if (depth >= 1.0) return;
        float z = -getViewZ(depth);
        float k = smoothstep(35.0, 260.0, z) * strength;
        outputColor.rgb = mix(inputColor.rgb, haze, k);
      }`, { attributes: EffectAttribute.DEPTH, uniforms: new Map<string, THREE.Uniform>([['haze', new THREE.Uniform(new THREE.Color('#9fc7e6'))], ['strength', new THREE.Uniform(strength)]]) });
  }
  set color(c: THREE.Color) { (this.uniforms.get('haze') as THREE.Uniform).value = c; }
}

export interface Post {
  render(dt: number): void;
  setSize(w: number, h: number): void;
  setExposure(v: number): void;
  /** activa o desactiva bloom, viñeta y antialiasing (a nivel bajo siempre está desactivado) */
  setEnabled(on: boolean): void;
  /** dirección hacia el sol para los rayos de luz (se guarda la referencia: basta llamarlo una vez) */
  setSun(dir: THREE.Vector3): void;
  /** color del horizonte para la perspectiva aérea (se guarda la referencia) */
  setHaze?(c: THREE.Color): void;
  /** efectos ajustables en vivo (solo niveles medio/alto) */
  fx?: { bloom: BloomEffect; hue: HueSaturationEffect; contrast: BrightnessContrastEffect; vignette: VignetteEffect; ink: Effect };
}

/** Nivel bajo: render directo con el tone mapping nativo. Medio/alto: contornos, bloom, viñeta y SMAA. */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, q: Quality): Post {
  if (q.tier === 'low') {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    return {
      render: () => renderer.render(scene, camera),
      setSize: () => {},
      setExposure: (v) => { renderer.toneMappingExposure = v; },
      setEnabled: () => {},
      setSun: () => {},
    };
  }
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  const ink = new InkEffect(); // va primero: así lee el color y el alfa de la escena tal cual salen del render
  const exposure = new ExposureEffect();
  const bloom = new BloomEffect({ intensity: 0.4, luminanceThreshold: 1.15, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const hue = new HueSaturationEffect({ saturation: 0.16 }); // paleta suave tipo acuarela: menos saturada que antes (0,34)
  const contrast = new BrightnessContrastEffect({ contrast: 0.08 });
  const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.28 });
  // rayos de sol entre los árboles: solo en escritorio (en móvil es otra máscara y 32 lecturas de textura por píxel)
  const rays = q.mobile ? null : new GodRaysEffect(camera, q.tier === 'high' ? 40 : 28);
  const aerial = new AerialEffect(q.ultra ? 0.5 : q.tier === 'high' ? 0.42 : 0.32);
  composer.addPass(new EffectPass(camera, aerial, ink, ...(rays ? [rays] : []), exposure, bloom, tone, hue, contrast, vignette));
  // en móvil la densidad de píxeles ya disimula los dientes de sierra: el SMAA es un pase de pantalla completa más (tres, con sus texturas de búsqueda)
  if (!q.mobile) composer.addPass(new EffectPass(camera, new SMAAEffect()));
  let enabled = true, expo = 0.5;
  return {
    render: (dt) => {
      if (enabled) { renderer.toneMapping = THREE.NoToneMapping; composer.render(dt); }
      else { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = expo * 1.1; renderer.render(scene, camera); }
    },
    setSize: (w, h) => composer.setSize(w, h, false),
    setExposure: (v) => { expo = v; exposure.exposure = v; },
    setEnabled: (on) => { enabled = on; },
    setSun: (dir) => { if (rays) rays.sunDir = dir; },
    setHaze: (c) => { aerial.color = c; },
    fx: { bloom, hue, contrast, vignette, ink },
  };
}
