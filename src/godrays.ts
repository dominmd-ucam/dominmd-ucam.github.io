import * as THREE from 'three';
import { Effect } from 'postprocessing';

/**
 * Rayos de sol (god rays) en espacio de pantalla, adaptados de VolumetricLightPass de stylized-components (Christian Ortiz, MIT).
 * Los rayos son la sombra de lo que hay entre la cámara y el sol (árboles, palmeras, la isla), estirada hacia el sol:
 *  1. máscara: a media resolución, solo el cielo (profundidad sin escribir) y lo bastante brillante emite luz;
 *  2. rayos: cada píxel camina hacia el sol en pantalla sumando la máscara; si por el camino hay un tronco, queda oscuro.
 * Va como Effect dentro del EffectPass de post.ts (tras los contornos y antes de la exposición), así no añade un pase de
 * pantalla completa: solo la máscara, que es pequeña. Si el sol queda detrás de la cámara, no se dibuja la máscara.
 */
export class GodRaysEffect extends Effect {
  /** dirección hacia el sol (la de dawn.ts; se lee cada fotograma) */
  sunDir = new THREE.Vector3(0, 1, 0);
  private readonly target: THREE.WebGLRenderTarget;
  private readonly maskMat: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly clip = new THREE.Vector4();
  private readonly vp = new THREE.Matrix4();

  constructor(private readonly sceneCamera: THREE.PerspectiveCamera, samples = 32) {
    super('GodRaysEffect', /* glsl */ `
      uniform sampler2D uMask;
      uniform vec2 uSunUv;
      uniform float uVisible;
      uniform float uAspect;
      uniform float uIntensity;
      uniform float uTime;
      uniform vec3 uTint;
      #define SAMPLES ${samples}
      float grHash(vec2 p) { p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
      float grNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(grHash(i), grHash(i + vec2(1.0, 0.0)), f.x), mix(grHash(i + vec2(0.0, 1.0)), grHash(i + vec2(1.0)), f.x), f.y);
      }
      // las muestras se apagan al salir de la pantalla: si no, un sol justo fuera del borde estira la última fila en rayas
      float grIn(vec2 uv) { vec2 e = smoothstep(vec2(0.0), vec2(0.03), uv) * smoothstep(vec2(1.0), vec2(0.97), uv); return e.x * e.y; }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = inputColor;
        if (uVisible <= 0.0) return;
        vec2 d = uv - uSunUv;
        float dist = length(d * vec2(uAspect, 1.0));
        float reach = pow(clamp(1.0 - dist / 1.4, 0.0, 1.0), 1.4); // alcance en alturas de pantalla
        if (reach <= 0.001) return;
        // el paso es una fracción de la distancia de este píxel al sol: todos cubren su línea con las mismas muestras
        vec2 stepUv = d * (0.85 / float(SAMPLES));
        vec2 p = uv - stepUv * grHash(gl_FragCoord.xy); // salida escalonada por píxel: grano fino en vez de anillos
        vec3 acc = vec3(0.0);
        float w = 1.0, wsum = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          p -= stepUv;
          acc += texture2D(uMask, clamp(p, 0.0, 1.0)).rgb * (w * grIn(p));
          wsum += w;
          w *= 0.965;
        }
        acc /= wsum;
        // polvo en el aire: parte el abanico en haces sueltos (reparte la luz, no la añade)
        vec2 da = d * vec2(uAspect, 1.0);
        float n = grNoise(vec2(atan(da.y, da.x + 1e-6) * 6.0, dist * 3.0 + uTime * 0.05));
        float strands = mix(1.0, 0.3 + 1.4 * smoothstep(0.25, 0.75, n), 0.35);
        vec3 shaft = mix(acc, uTint * max(max(acc.r, acc.g), acc.b), 0.35);
        outputColor.rgb += shaft * uIntensity * reach * strands * uVisible;
      }`, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uMask', new THREE.Uniform(null)], ['uSunUv', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))], ['uVisible', new THREE.Uniform(0)],
        ['uAspect', new THREE.Uniform(1.78)], ['uIntensity', new THREE.Uniform(0.55)], ['uTime', new THREE.Uniform(0)],
        ['uTint', new THREE.Uniform(new THREE.Color('#ffe2b8'))],
      ]),
    });
    // media precisión: el cielo pasa de 1 antes de la exposición y una máscara de 8 bits lo recortaría
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
    this.maskMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: null }, uDepth: { value: null }, uThreshold: { value: 0.9 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // cielo = profundidad sin escribir (el cielo pintado no escribe profundidad); con near 0,1 / far 6000 nada dibujado llega a 0,99999
      fragmentShader: /* glsl */ `uniform sampler2D uColor; uniform sampler2D uDepth; uniform float uThreshold; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(uColor, vUv).rgb;
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float open = step(0.99999, texture2D(uDepth, vUv).x);
          gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.4, lum) * open, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.maskMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    (this.uniforms.get('uMask') as THREE.Uniform).value = this.target.texture;
  }

  set intensity(v: number) { (this.uniforms.get('uIntensity') as THREE.Uniform).value = v; }
  get intensity() { return (this.uniforms.get('uIntensity') as THREE.Uniform).value as number; }

  setDepthTexture(depthTexture: THREE.Texture) { this.maskMat.uniforms.uDepth.value = depthTexture; }

  setSize(width: number, height: number) {
    this.target.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
    (this.uniforms.get('uAspect') as THREE.Uniform).value = width / Math.max(height, 1);
  }

  /** Dónde cae el sol en pantalla y cuánto se ve (0 detrás de la cámara; se apaga poco a poco al salir por los lados). */
  private sunOnScreen(): number {
    const cam = this.sceneCamera;
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.clip.set(cam.position.x + this.sunDir.x * 100, cam.position.y + this.sunDir.y * 100, cam.position.z + this.sunDir.z * 100, 1).applyMatrix4(this.vp);
    if (this.clip.w <= 0) return 0;
    const sx = (this.clip.x / this.clip.w) * 0.5 + 0.5, sy = (this.clip.y / this.clip.w) * 0.5 + 0.5;
    (this.uniforms.get('uSunUv') as THREE.Uniform<THREE.Vector2>).value.set(sx, sy);
    return THREE.MathUtils.clamp(Math.min((Math.min(sx, 1 - sx) + 0.25) / 0.35, (Math.min(sy, 1 - sy) + 0.25) / 0.35), 0, 1);
  }

  update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, dt?: number) {
    const vis = this.intensity > 0 ? this.sunOnScreen() : 0;
    (this.uniforms.get('uVisible') as THREE.Uniform).value = vis;
    (this.uniforms.get('uTime') as THREE.Uniform<number>).value += dt ?? 0;
    if (vis <= 0) return;
    this.maskMat.uniforms.uColor.value = inputBuffer.texture;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.quadScene, this.quadCam);
    renderer.setRenderTarget(prev);
  }

  dispose() {
    this.target.dispose(); this.maskMat.dispose(); this.quad.geometry.dispose();
    super.dispose();
  }
}
