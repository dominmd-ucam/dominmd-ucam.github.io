import * as THREE from 'three';
import { fbm, groundColor, heightAt, pathCover, pathDist } from './terrain';
import { CLOUD_GLSL } from './toon';
import { tagTsl } from '../gfx/tag';

const NEAR_FULL = 18; // metros hasta los que se dibuja la hoja completa
// degradado por altura: la raíz más oscura (oclusión entre hojas) y la punta más clara y amarilla, como en BotW
const ROOT = new THREE.Color(0.62, 0.66, 0.6), MID = new THREE.Color(0.95, 0.98, 0.9), TIP = new THREE.Color(1.28, 1.24, 0.92);

/**
 * Hoja de 5 vértices (3 triángulos) como la de three-grass-demo de James Smyth: base ancha, cintura a media altura
 * y una punta desplazada hacia delante, así cada hoja ya nace doblada. `position.y` va de 0 (raíz) a 1 (punta).
 */
function bladeFull(): THREE.BufferGeometry {
  const pos = [-0.5, 0, 0, 0.5, 0, 0, 0.27, 0.5, 0.04, -0.27, 0.5, 0.04, 0, 1, 0.22];
  const col = [ROOT, ROOT, MID, MID, TIP].flatMap((c) => [c.r, c.g, c.b]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex([0, 1, 2, 2, 4, 3, 3, 0, 2]);
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(15).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return geo;
}

/** Hoja ligera: un solo triángulo. A distancia no se distingue de la completa y cuesta 3 veces menos triángulos. */
function bladeLite(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.42, 0, 0, 0.42, 0, 0, 0, 1, 0.22], 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute([ROOT, ROOT, TIP].flatMap((c) => [c.r, c.g, c.b]), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  return geo;
}

/**
 * Hierba instanciada al estilo de Breath of the Wild. Cada bloque de 16 m tiene dos mallas que comparten los mismos datos de instancias:
 * la hoja completa (cerca) y la ligera (lejos). En calidad baja solo existe la ligera.
 *  - cada hoja toma el color del suelo donde crece y se ilumina con la normal del suelo (hacia arriba): la pradera y el terreno se funden;
 *  - el viento son ráfagas que recorren el campo en una dirección (las hojas inclinadas se aclaran, como las olas de hierba de BotW);
 *  - las sombras de las nubes pasan por encima igual que por el terreno;
 *  - la hierba se aparta al paso del personaje;
 *  - se genera por bloques alrededor del jugador (la isla es grande): `density` hojas por m² en los bloques cercanos, la mitad
 *    a media distancia y una cuarta parte lejos; los bloques que quedan atrás se liberan;
 *  - hay manchas de hierba alta (0,9–1,25 m) lejos de los caminos, que tapan lo que hay detrás.
 * Con `setInkMask(true)` el fragment shader escribe alfa 0: el postprocesado lo usa para no dibujar contornos en la hierba.
 * Solo debe activarse cuando se dibuja a través del postprocesado: directo al lienzo, el alfa 0 dejaría ver el fondo de la página en algunos navegadores.
 */
export function buildGrass(density: number, liteOnly = false, receiveShadow = false, opts: { maxRing?: number; nearFull?: number } = {}): { group: THREE.Group; update(t: number, cam?: THREE.Vector3, player?: THREE.Vector3): void; setInkMask(on: boolean): void } {
  const geoFull = liteOnly ? null : bladeFull(), geoLite = bladeLite();

  const uTime = { value: 0 }, uPlayer = { value: new THREE.Vector3(0, -99, 0) }, uAlpha = { value: 1 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  mat.defines = { TOON_NO_RIM: '' };
  tagTsl(mat, 'grass', { uTime, uPlayer, uAlpha });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uPlayer = uPlayer;
    sh.uniforms.uAlpha = uAlpha;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform vec3 uPlayer;
        varying float vGust;
        varying float vCloud;
        ${CLOUD_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // el desplazamiento se calcula en el mundo y se pasa al espacio de la hoja: así sombras y niebla usan la hoja ya doblada
        mat3 bm = mat3(instanceMatrix);
        vec2 ip = instanceMatrix[3].xz;
        float bladeH = length(bm[1]);
        float bend = position.y * position.y;
        const vec2 windDir = vec2(0.8, 0.6);
        float along = dot(ip, windDir);
        float gust = 0.5 + 0.5 * sin(along * 0.11 - uTime * 0.85);           // ráfaga ancha que cruza la isla
        float wave = 0.5 + 0.5 * sin(along * 0.8 - uTime * 2.3 + ip.y * 0.15); // ondas cortas dentro de la ráfaga
        float sway = (0.2 + 0.8 * gust) * (0.45 + 0.55 * wave);
        vec2 off = windDir * sway * 0.38 + vec2(-windDir.y, windDir.x) * sin(uTime * 1.7 + ip.x * 1.3 + ip.y * 0.7) * 0.06;
        vec2 dp = ip - uPlayer.xz;
        float dist = length(dp);
        float push = (1.0 - smoothstep(0.2, 1.0, dist)) * step(abs(uPlayer.y - instanceMatrix[3].y), 1.5);
        off += dp / max(dist, 0.001) * push * 0.75;
        vec3 w = vec3(off.x, -dot(off, off) * 0.45, off.y) * bend * bladeH; // al inclinarse, la punta baja
        transformed += vec3(dot(bm[0], w) / dot(bm[0], bm[0]), dot(bm[1], w) / dot(bm[1], bm[1]), dot(bm[2], w) / dot(bm[2], bm[2]));
        vGust = gust * wave * position.y * (1.0 - push);
        vCloud = cloudShadow(ip, uTime);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAlpha;\nvarying float vGust;\nvarying float vCloud;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb += vec3(0.07, 0.08, 0.025) * vGust;
        diffuseColor.rgb *= 1.0 - 0.2 * vCloud;`)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = uAlpha;');
  };

  const CELL = 16;
  /** fracción de la densidad según el anillo de bloques (distancia de Chebyshev al bloque del jugador): 0–1, 2, 3 */
  const RING_FRAC = [1, 1, 0.5, 0.22];
  const MAX_RING = opts.maxRing ?? (liteOnly ? 2 : 3);
  const nearFull = opts.nearFull ?? NEAR_FULL;
  const group = new THREE.Group();
  interface Cell { cx: number; cz: number; gen: number; full: number; far: THREE.InstancedMesh; near: THREE.InstancedMesh | null; center: THREE.Vector3 }
  const cells = new Map<string, Cell>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();

  /** Rejilla de 9×9 puntos por bloque (cada 2 m): color del suelo, inclinación y si puede crecer hierba alta (lejos de los caminos). Las hojas interpolan. */
  const G = 9;
  const gridCol = new Float32Array(G * G * 3), gridTall = new Float32Array(G * G), gridNy = new Float32Array(G * G);
  function fillGrid(x0: number, z0: number) {
    const c = new THREE.Color(), e = 0.4;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = x0 + (i * CELL) / (G - 1), z = z0 + (j * CELL) / (G - 1), h = heightAt(x, z);
      const ny = 1 / Math.hypot(1, (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e));
      groundColor(x, z, h, ny, c);
      const k = j * G + i;
      gridCol[k * 3] = c.r; gridCol[k * 3 + 1] = c.g; gridCol[k * 3 + 2] = c.b;
      gridNy[k] = ny;
      gridTall[k] = THREE.MathUtils.smoothstep(pathDist(x, z), 2.2, 4) * THREE.MathUtils.smoothstep(fbm(x * 0.045 + 20, z * 0.045 - 11), 0.56, 0.64);
    }
  }
  let sampledNy = 1;
  /** Interpola la rejilla en (u, v): devuelve la "altura" de hierba, deja el color en `out` y la inclinación del suelo en `sampledNy`. */
  function sampleGrid(u: number, v: number, out: THREE.Color): number {
    const fx = u * (G - 1), fz = v * (G - 1), i = Math.min(G - 2, Math.floor(fx)), j = Math.min(G - 2, Math.floor(fz)), a = fx - i, b = fz - j;
    const k00 = j * G + i, k10 = k00 + 1, k01 = k00 + G, k11 = k01 + 1;
    const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
    out.setRGB(
      gridCol[k00 * 3] * w00 + gridCol[k10 * 3] * w10 + gridCol[k01 * 3] * w01 + gridCol[k11 * 3] * w11,
      gridCol[k00 * 3 + 1] * w00 + gridCol[k10 * 3 + 1] * w10 + gridCol[k01 * 3 + 1] * w01 + gridCol[k11 * 3 + 1] * w11,
      gridCol[k00 * 3 + 2] * w00 + gridCol[k10 * 3 + 2] * w10 + gridCol[k01 * 3 + 2] * w01 + gridCol[k11 * 3 + 2] * w11);
    sampledNy = gridNy[k00] * w00 + gridNy[k10] * w10 + gridNy[k01] * w01 + gridNy[k11] * w11;
    return gridTall[k00] * w00 + gridTall[k10] * w10 + gridTall[k01] * w01 + gridTall[k11] * w11;
  }

  /**
   * Crea (o rehace con más hojas) el bloque (cx, cz) para el anillo `ring`. Determinista: el mismo bloque sale siempre igual.
   * Es un generador: se pausa cada 400 hojas para repartir el trabajo entre fotogramas (antes un bloque entero podía tardar más
   * que el presupuesto y dar un tirón al cruzar de bloque, sobre todo en móvil). La inclinación del suelo sale de la rejilla:
   * una llamada a heightAt por hoja en vez de cinco.
   */
  function* build(cx: number, cz: number, ring: number): Generator<void, void, void> {
    let seed = (cx * 73856093) ^ (cz * 19349663) ^ 0x5bd1e995;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const x0 = cx * CELL, z0 = cz * CELL;
    fillGrid(x0, z0);
    const tries = Math.round(density * CELL * CELL * RING_FRAC[ring]);
    const mats: number[] = [], cols: number[] = [];
    for (let n = 0; n < tries; n++) {
      if (n % 400 === 399) yield;
      const u = rnd(), v = rnd(), x = x0 + u * CELL, z = z0 + v * CELL, h = heightAt(x, z);
      if (h < 1.0 || pathCover(x, z) > 0.32) continue;
      const tallness = sampleGrid(u, v, col);
      if (sampledNy < 0.8) continue; // en las rocas no crece
      const tall = tallness > rnd() * 0.6 + 0.3;
      const hh = tall ? 0.9 + rnd() * 0.35 : 0.25 + rnd() * 0.35;
      p.set(x, h - 0.02, z);
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      sc.set(tall ? 0.12 + rnd() * 0.05 : 0.09 + rnd() * 0.05, hh, 1);
      m4.compose(p, q, sc);
      mats.push(...m4.elements);
      col.offsetHSL((rnd() - 0.5) * 0.03, 0.02, (rnd() - 0.5) * 0.06 + (tall ? -0.02 : 0));
      cols.push(col.r, col.g, col.b);
    }
    const count = cols.length / 3;
    const old = cells.get(key(cx, cz));
    if (old) dispose(old); // el bloque anterior se quita al final: así no hay huecos mientras se rehace
    const far = new THREE.InstancedMesh(geoLite, mat, Math.max(1, count));
    far.instanceMatrix.array.set(mats);
    far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(3, cols.length)).fill(1), 3);
    (far.instanceColor.array as Float32Array).set(cols);
    far.count = count;
    far.computeBoundingSphere();
    far.boundingSphere!.radius += 1.2; // margen para el movimiento del viento
    group.add(far);
    let near: THREE.InstancedMesh | null = null;
    if (geoFull) {
      near = new THREE.InstancedMesh(geoFull, mat, Math.max(1, count));
      near.instanceMatrix = far.instanceMatrix; near.instanceColor = far.instanceColor; // mismos datos, otra geometría
      near.count = count;
      near.boundingSphere = far.boundingSphere!.clone();
      near.receiveShadow = receiveShadow; // solo de cerca: lejos la sombra apenas se ve y es lo que más cuesta por píxel
      group.add(near);
    }
    cells.set(key(cx, cz), { cx, cz, gen: ring, full: count, far, near, center: new THREE.Vector3(x0 + CELL / 2, 0, z0 + CELL / 2) });
  }
  function dispose(c: Cell) {
    group.remove(c.far); c.far.dispose();
    if (c.near) { group.remove(c.near); c.near.dispose(); }
    cells.delete(key(c.cx, c.cz));
  }

  let pcx = 1e9, pcz = 1e9;
  let job: Generator<void, void, void> | null = null, jobRing = 0;
  const queue: [number, number, number][] = [];
  /** Bloques que faltan o que necesitan más hojas, ordenados del más cercano al más lejano. */
  function plan(cx: number, cz: number) {
    queue.length = 0;
    for (const c of [...cells.values()]) if (Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz)) > MAX_RING + 1) dispose(c);
    for (let dz = -MAX_RING; dz <= MAX_RING; dz++) for (let dx = -MAX_RING; dx <= MAX_RING; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz)), c = cells.get(key(cx + dx, cz + dz));
      if (!c || RING_FRAC[c.gen] < RING_FRAC[ring]) queue.push([cx + dx, cz + dz, ring]);
    }
    queue.sort((a, b) => a[2] - b[2]);
  }

  return {
    group,
    setInkMask: (on: boolean) => { uAlpha.value = on ? 0 : 1; },
    update: (t: number, cam?: THREE.Vector3, player?: THREE.Vector3) => {
      uTime.value = t;
      if (player) uPlayer.value.copy(player);
      const focus = player ?? cam;
      if (!focus) return;
      const cx = Math.floor(focus.x / CELL), cz = Math.floor(focus.z / CELL);
      if (cx !== pcx || cz !== pcz) { pcx = cx; pcz = cz; plan(cx, cz); }
      // los bloques se generan poco a poco (unos 6 ms por fotograma) para no dar tirones; el primero de cada vez siempre
      const t0 = performance.now();
      // al empezar, los 9 bloques de alrededor se generan de golpe (detrás de la pantalla de carga); después, 4 ms por fotograma como mucho
      for (;;) {
        if (!job) {
          if (!queue.length) break;
          const [x, z, r] = queue.shift()!;
          job = build(x, z, r); jobRing = r;
        }
        if (performance.now() - t0 >= 4 && !(jobRing <= 1 && cells.size < 9)) break;
        if (job.next().done) job = null;
      }
      if (!cam) return;
      // LOD: hasta 18 m (centro del bloque) la hoja completa y desde ahí la ligera; los bloques lejanos dibujan solo parte de sus hojas
      // (están en orden aleatorio, así que dibujar las N primeras adelgaza el césped de forma uniforme)
      for (const c of cells.values()) {
        const ring = Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz));
        const k = ring > MAX_RING ? 0 : Math.round(c.full * Math.min(1, RING_FRAC[ring] / RING_FRAC[c.gen]));
        const useNear = c.near !== null && Math.hypot(c.center.x - cam.x, c.center.z - cam.z) < nearFull;
        if (c.near) { c.near.count = k; c.near.visible = k > 0 && useNear; }
        c.far.count = k; c.far.visible = k > 0 && !useNear;
      }
    },
  };
}
