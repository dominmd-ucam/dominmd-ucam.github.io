import * as THREE from 'three';
import { ISLAND_R, groundColor, heightAt, pathMask } from './terrain';
import { CLOUD_GLSL } from './toon';

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
 *  - la hierba se aparta al paso del personaje.
 * Con `setInkMask(true)` el fragment shader escribe alfa 0: el postprocesado lo usa para no dibujar contornos en la hierba.
 * Solo debe activarse cuando se dibuja a través del postprocesado: directo al lienzo, el alfa 0 dejaría ver el fondo de la página en algunos navegadores.
 */
export function buildGrass(count: number, liteOnly = false, receiveShadow = false): { group: THREE.Group; update(t: number, cam?: THREE.Vector3, player?: THREE.Vector3): void; setInkMask(on: boolean): void } {
  const geoFull = liteOnly ? null : bladeFull(), geoLite = bladeLite();

  const uTime = { value: 0 }, uPlayer = { value: new THREE.Vector3(0, -99, 0) }, uAlpha = { value: 1 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  mat.defines = { TOON_NO_RIM: '' };
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

  // posiciones primero; después se reparten en bloques de 16 m para que el motor pueda descartar los que no se ven
  const CELL = 16;
  const chunks = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let n = 0, guard = 0;
  while (n < count && guard++ < count * 12) {
    const x = (Math.random() - 0.5) * ISLAND_R * 2.6, z = (Math.random() - 0.5) * ISLAND_R * 2.6, h = heightAt(x, z);
    if (h < 1.0 || h > 5.4 || pathMask(x, z) > 0.25) continue;
    const e = 0.4, ny = 1 / Math.hypot(1, (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e));
    if (ny < 0.8) continue; // en las rocas no crece
    const hh = 0.3 + Math.random() * 0.45;
    p.set(x, h - 0.02, z);
    q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
    s.set(0.09 + Math.random() * 0.05, hh, 1);
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let list = chunks.get(key);
    if (!list) { list = []; chunks.set(key, list); }
    const c = groundColor(x, z, h, ny, new THREE.Color()).offsetHSL((Math.random() - 0.5) * 0.03, 0.02, (Math.random() - 0.5) * 0.06);
    list.push({ m: new THREE.Matrix4().compose(p, q, s), c });
    n++;
  }
  const group = new THREE.Group();
  const lod: { near: THREE.InstancedMesh | null; far: THREE.InstancedMesh; center: THREE.Vector3; full: number }[] = [];
  for (const list of chunks.values()) {
    const far = new THREE.InstancedMesh(geoLite, mat, list.length);
    list.forEach((it, i) => { far.setMatrixAt(i, it.m); far.setColorAt(i, it.c); });
    far.instanceMatrix.needsUpdate = true;
    if (far.instanceColor) far.instanceColor.needsUpdate = true;
    far.computeBoundingSphere();
    far.boundingSphere!.radius += 0.8; // margen para el movimiento del viento
    group.add(far);
    let near: THREE.InstancedMesh | null = null;
    if (geoFull) {
      near = new THREE.InstancedMesh(geoFull, mat, list.length);
      near.instanceMatrix = far.instanceMatrix; near.instanceColor = far.instanceColor; // mismos datos, otra geometría
      near.boundingSphere = far.boundingSphere!.clone();
      near.receiveShadow = receiveShadow; // solo de cerca: lejos la sombra apenas se ve y es lo que más cuesta por píxel
      group.add(near);
    }
    lod.push({ near, far, center: far.boundingSphere!.center.clone(), full: list.length });
  }
  // LOD: las instancias están en orden aleatorio, así que dibujar solo las N primeras adelgaza el césped de forma uniforme.
  // Cerca se ve todo; a media distancia la mitad; lejos una cuarta parte; más allá de 90 m, nada. Hasta 18 m (centro del bloque) se usa la hoja completa y desde ahí la ligera: a esa distancia una hoja mide 1–5 píxeles de ancho y no se distinguen.
  return {
    group,
    setInkMask: (on: boolean) => { uAlpha.value = on ? 0 : 1; },
    update: (t: number, cam?: THREE.Vector3, player?: THREE.Vector3) => {
      uTime.value = t;
      if (player) uPlayer.value.copy(player);
      if (!cam) return;
      for (const { near, far, center, full } of lod) {
        const d = Math.hypot(center.x - cam.x, center.z - cam.z);
        const f = d < 26 ? 1 : d < 46 ? 0.5 : d < 90 ? 0.22 : 0;
        const useNear = near !== null && d < NEAR_FULL;
        const k = Math.round(full * f);
        if (near) { near.count = k; near.visible = f > 0 && useNear; }
        far.count = k; far.visible = f > 0 && !useNear;
      }
    },
  };
}
