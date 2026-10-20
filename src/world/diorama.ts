import * as THREE from 'three';
import { heightAt, islandRadius, CAVE } from './terrain';
import type { Obstacle } from './props';
import { waveHeight } from './water';
import { batchStatic } from './batch';
import { stoneGeometry, stoneMaterial } from './stone';

const mat = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  parent.add(o);
  return o;
}
const rock = (r: number, seed: number, sy = 1) => stoneGeometry(r, seed, sy);
const world = (g: THREE.Object3D, lx: number, lz: number) => { g.updateMatrixWorld(true); const v = g.localToWorld(new THREE.Vector3(lx, 0, lz)); return { x: v.x, z: v.z }; };

/* ---------- casco del barco varado ----------
   Velero mercante de 12 m tumbado en la arena. El casco se genera por secciones: s recorre la eslora (−1 popa, 1 proa) y
   φ la sección de una borda a la otra pasando por la quilla. Tablas por franjas (tracas), cinta oscura arriba, algas abajo
   y un boquete en el costado de estribor que deja ver las cuadernas. */
const L = 12, BEAM = 2.3, DEPTH = 2.0;
const widthAt = (s: number) => (s > 0 ? Math.pow(Math.max(0, 1 - Math.pow(s, 2.4)), 0.55) : 1 - Math.pow(-s, 5) * 0.25);
const sheerAt = (s: number) => 0.9 * Math.pow(Math.abs(s), 2.5) * (s > 0 ? 1 : 0.7); // la borda sube hacia proa y popa
const depthAt = (s: number) => DEPTH * (s > 0 ? 1 - Math.pow(s, 3) * 0.55 : 1 - Math.pow(-s, 4) * 0.3);
/** ¿cae en el boquete? (borde irregular) */
const inHole = (s: number, f: number) => {
  const j = Math.sin(s * 37.1) * 0.04 + Math.sin(f * 23.3) * 0.05;
  return s > -0.32 + j && s < 0.12 + j && f > 0.62 + j && f < 0.9 - j;
};
function hullPoint(s: number, f: number, out: THREE.Vector3) {
  const phi = f * Math.PI, w = Math.max(widthAt(s), 0.015);
  return out.set(s * L / 2, sheerAt(s) - Math.pow(Math.sin(phi), 0.75) * depthAt(s), -Math.cos(phi) * BEAM * w);
}
function hullGeometry(): THREE.BufferGeometry {
  const NS = 34, NF = 18, pos: number[] = [], col: number[] = [], v = new THREE.Vector3(), c = new THREE.Color();
  const planks = [new THREE.Color('#9a6640'), new THREE.Color('#87573a')], wale = new THREE.Color('#4a2e1e'), algae = new THREE.Color('#5f8a4a');
  const quad = (i: number, k: number) => {
    const s0 = -1 + (2 * i) / NS, s1 = -1 + (2 * (i + 1)) / NS, f0 = k / NF, f1 = (k + 1) / NF;
    if (inHole((s0 + s1) / 2, (f0 + f1) / 2)) return;
    const base = planks[k % 2], f = (f0 + f1) / 2;
    c.copy(base).multiplyScalar(0.92 + 0.16 * ((Math.sin(i * 12.9 + k * 7.3) + 1) / 2)); // tablas de tono distinto
    if (k === 1 || k === NF - 2) c.copy(wale);
    c.lerp(algae, THREE.MathUtils.smoothstep(Math.sin(f * Math.PI), 0.9, 1) * 0.7);
    for (const [ss, ff] of [[s0, f0], [s1, f0], [s1, f1], [s0, f0], [s1, f1], [s0, f1]]) {
      hullPoint(ss, ff, v); pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b);
    }
  };
  for (let i = 0; i < NS; i++) for (let k = 0; k < NF; k++) quad(i, k);
  // espejo de popa: cierra la sección de s = −1
  const st = new THREE.Vector3(), sb = new THREE.Vector3(), cen = new THREE.Vector3(-L / 2, sheerAt(-1) - depthAt(-1) * 0.35, 0);
  c.set('#7a4d32');
  for (let k = 0; k < NF; k++) {
    hullPoint(-1, k / NF, st); hullPoint(-1, (k + 1) / NF, sb);
    for (const p of [cen, sb, st]) { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Vela rasgada caída sobre la arena: una lona con pliegues y el borde comido. */
function sailGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(3.2, 2.6, 12, 10).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.sin(x * 2.1) * 0.12 + Math.sin(y * 3.3 + x) * 0.08 + Math.max(0, x - 0.6) * 0.35);
  }
  // quita triángulos del borde para que parezca rota
  const keep: number[] = [];
  for (let t = 0; t < p.count / 3; t++) {
    const cx = (p.getX(t * 3) + p.getX(t * 3 + 1) + p.getX(t * 3 + 2)) / 3, cy = (p.getY(t * 3) + p.getY(t * 3 + 1) + p.getY(t * 3 + 2)) / 3;
    const ragged = cy < -0.9 + Math.abs(Math.sin(cx * 5.3)) * 0.5 || (cx > 1.1 && cy > 0.6 + Math.sin(cy * 9) * 0.2);
    if (!ragged) for (let k = 0; k < 3; k++) keep.push(t * 3 + k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep.flatMap((i) => [p.getX(i), p.getY(i), p.getZ(i)]), 3));
  out.computeVertexNormals();
  return out;
}

export interface Diorama {
  update(t: number): void;
  obstacles: Obstacle[];
}

export function buildDiorama(scene: THREE.Object3D): Diorama {
  const obstacles: Obstacle[] = [];
  const ticks: ((t: number) => void)[] = [];
  const WOOD = mat('#d08c5a'), WOOD_D = mat('#7d3d26');
  const GREY = stoneMaterial('#b3a08c'), GREY_D = stoneMaterial('#8f7d6e');

  /* ---------- barco varado ---------- */
  {
    const a = 1.38, r = islandRadius(a) * 0.93;
    const sx = Math.cos(a) * r, sz = Math.sin(a) * r;
    const ship = new THREE.Group();
    ship.position.set(sx, heightAt(sx, sz) + 0.95, sz);
    ship.rotation.set(-0.36, -a + 0.25, 0.06, 'YXZ'); // proa hacia el mar y tumbado sobre babor (el boquete de estribor queda a la vista)
    const hull = new THREE.Mesh(hullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, flatShading: true }));
    hull.castShadow = hull.receiveShadow = true;
    ship.add(hull);
    const WOOD_W = mat('#b88a5e'), TAR = mat('#4a2e1e'), v = new THREE.Vector3();
    // cubierta de tablas con huecos
    for (let k = 0; k < 22; k++) {
      const s = -0.95 + k * 0.088;
      if (s > 0.86 || k === 7 || k === 8 || k === 13) continue;
      const w = Math.max(widthAt(s), 0.05);
      add(ship, new THREE.BoxGeometry(L * 0.04, 0.07, 2 * BEAM * w * 0.94), k % 3 ? WOOD : WOOD_W, s * L / 2, sheerAt(s) - 0.18, 0);
    }
    // cuadernas que asoman por el boquete
    for (const s of [-0.26, -0.16, -0.06, 0.04]) {
      for (let k = 0; k < 7; k++) {
        const f0 = 0.5 + k * 0.065, f1 = f0 + 0.065;
        const p0 = hullPoint(s, f0, new THREE.Vector3()), p1 = hullPoint(s, f1, v);
        const seg = add(ship, new THREE.BoxGeometry(0.16, p0.distanceTo(p1) + 0.04, 0.16), WOOD_D, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      }
    }
    // borda: cinta y candeleros, con un tramo arrancado
    for (const side of [-1, 1]) for (let k = 0; k < 16; k++) {
      const s = -0.9 + k * 0.11;
      if (side === 1 && (k === 6 || k === 7 || k === 8)) continue;
      hullPoint(s, side < 0 ? 0.02 : 0.98, v);
      add(ship, new THREE.CylinderGeometry(0.05, 0.06, 0.7, 5), WOOD_D, v.x, v.y + 0.3, v.z * 0.97);
    }
    // quilla y roda (la proa sube en curva)
    add(ship, new THREE.BoxGeometry(L * 0.9, 0.22, 0.2), TAR, 0.2, -depthAt(0) - 0.05, 0);
    const stem = add(ship, new THREE.TorusGeometry(1.4, 0.11, 5, 8, Math.PI / 2), TAR, L / 2 - 1.3, sheerAt(1) - 0.9, 0);
    stem.rotation.z = -0.15;
    // palo mayor partido: el muñón en cubierta y el resto caído en la arena con la vela
    add(ship, new THREE.CylinderGeometry(0.17, 0.2, 1.8, 8), WOOD_D, 0.6, sheerAt(0.1) + 0.6, 0);
    add(ship, new THREE.ConeGeometry(0.2, 0.5, 6, 1, true), WOOD_W, 0.6, sheerAt(0.1) + 1.7, 0).rotation.z = Math.PI;
    batchStatic(ship);
    scene.add(ship);
    const side = new THREE.Vector3(Math.sin(-a + 0.25 + Math.PI / 2), 0, Math.cos(-a + 0.25 + Math.PI / 2));
    const mx = sx - side.x * 4.2 + Math.cos(a) * 1.5, mz = sz - side.z * 4.2 + Math.sin(a) * 1.5;
    const fallen = new THREE.Group(); fallen.position.set(mx, heightAt(mx, mz) + 0.12, mz); fallen.rotation.y = -a + 0.9;
    add(fallen, new THREE.CylinderGeometry(0.13, 0.17, 6, 8), WOOD_D, 0, 0, 0).rotation.z = Math.PI / 2 - 0.05;
    add(fallen, new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), WOOD_D, -1.2, 0.05, 0).rotation.x = Math.PI / 2; // verga
    const sail = add(fallen, sailGeometry(), mat('#efe2c4', { side: THREE.DoubleSide, flatShading: false }), -1.3, 0.12, 1.1);
    sail.rotation.x = -Math.PI / 2 + 0.08;
    scene.add(fallen);
    obstacles.push({ x: mx, z: mz, r: 0.5 });
    // carga desperdigada: cajas y barriles medio hundidos
    const crate = mat('#a8794c'), band = mat('#5a3a24');
    const cargo: [number, number, number, boolean][] = [[-3.2, 2.6, 0.4, true], [-2.4, 3.4, 1.1, false], [2.8, 3.6, 0.2, true], [3.6, 2.2, 2.2, false], [-4.6, -1.2, 0.7, true]];
    for (const [ox, oz, rot, isCrate] of cargo) {
      const cx2 = sx + side.x * ox + Math.cos(a) * oz * 0.3, cz2 = sz + side.z * ox + Math.sin(a) * oz * 0.3;
      const g = new THREE.Group(); g.position.set(cx2, heightAt(cx2, cz2) - 0.12, cz2); g.rotation.set(0.15 * Math.sin(rot * 3), rot, 0.2 * Math.cos(rot * 5));
      if (isCrate) { add(g, new THREE.BoxGeometry(0.75, 0.75, 0.75), crate, 0, 0.37, 0); add(g, new THREE.BoxGeometry(0.78, 0.1, 0.78), band, 0, 0.6, 0); }
      else { const b = add(g, new THREE.CylinderGeometry(0.34, 0.3, 0.85, 10), crate, 0, 0.3, 0); b.rotation.z = Math.PI / 2; for (const dx of [-0.25, 0.25]) add(g, new THREE.TorusGeometry(0.33, 0.035, 4, 12), band, dx, 0.3, 0).rotation.y = Math.PI / 2; }
      scene.add(g);
      obstacles.push({ x: cx2, z: cz2, r: 0.5 });
    }
    // montículo de arena contra el costado enterrado
    const sand = new THREE.MeshStandardMaterial({ color: '#ecc985', roughness: 1 });
    for (let k = 0; k < 6; k++) {
      const lx = -4.5 + k * 1.8; const w = world(ship, lx, -BEAM * 0.7);
      const m = add(scene, new THREE.SphereGeometry(1.5, 10, 6), sand, w.x, heightAt(w.x, w.z) - 0.85, w.z);
      m.scale.set(1.3, 0.55, 1); m.castShadow = false;
    }
    for (const lx of [-4.6, -2.6, -0.6, 1.4, 3.4, 5]) { const w = world(ship, lx, 0); obstacles.push({ x: w.x, z: w.z, r: 1.8 }); }
  }

  /* ---------- formación de roca con cueva, enredaderas y nido ---------- */
  {
    // marco de roca de la entrada a la cueva (el túnel y la sala los pone zones.ts); la boca mira al mar
    const cx = CAVE.x, cz = CAVE.z;
    const g = new THREE.Group(); g.position.set(cx, heightAt(cx, cz) - 0.3, cz); g.rotation.y = Math.atan2(-CAVE.dx, -CAVE.dz);
    const pillars: [number, number, number, number][] = [[-3.3, 0, 0.2, 2.1], [3.3, 0, 0.2, 2.0]];
    for (const [px, py, pz, pr] of pillars) add(g, rock(pr, px * 3 + pz, 1.5), px < 0 ? GREY : GREY_D, px, py + 1.7, pz);
    add(g, rock(2.9, 5, 0.65), GREY, 0, 4.0, -1.3).scale.x = 1.6;               // techo
    add(g, rock(1.7, 11, 1.2), GREY_D, -1.2, 5.3, -2.0);
    add(g, rock(1.5, 17, 1.5), GREY, 1.2, 5.6, -2.4);
    add(g, rock(1.0, 3, 0.9), GREY, 3.2, 0.5, 1.4);
    add(g, rock(0.8, 8, 0.9), GREY_D, -3.6, 0.4, 1.9);
    // nido con huevos en lo alto
    add(g, new THREE.TorusGeometry(0.42, 0.12, 5, 9), mat('#8a5a35'), 1.2, 7.1, -2.4).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) add(g, new THREE.SphereGeometry(0.17, 8, 6), mat('#f4ecd4'), 1.2 + (i - 1) * 0.2, 7.12, -2.4 + (i % 2) * 0.12);
    batchStatic(g);
    scene.add(g);
    for (const [px, , pz, pr] of pillars) { const w = world(g, px, pz); obstacles.push({ x: w.x, z: w.z, r: pr * 0.85 }); }

    // enredaderas: cadenas de hojas colgando de la roca
    const leafGeo = new THREE.IcosahedronGeometry(0.15, 0); leafGeo.scale(1.4, 0.8, 1);
    const anchors = [[-3.2, 3.7, 1.6], [3.1, 3.5, 1.5], [-3.9, 2.6, 0.9], [3.8, 2.7, 0.8], [-2.4, 4.3, 0.2], [2.3, 4.2, 0.3]]; // a los lados: la boca queda despejada
    const leaves: THREE.Vector3[] = [];
    for (const [ax, ay, az] of anchors) {
      for (let c = 0; c < 7; c++) {
        const ox = ax + (Math.random() - 0.5) * 1.2, oz = az + (Math.random() - 0.5) * 0.6, len = 3 + Math.floor(Math.random() * 7);
        for (let k = 0; k < len; k++) leaves.push(new THREE.Vector3(ox + (Math.random() - 0.5) * 0.15, ay - k * 0.32, oz));
      }
    }
    const uTime = { value: 0 };
    const vm = new THREE.MeshStandardMaterial({ color: '#4fbf4a', roughness: 0.8, flatShading: true });
    vm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 ip = instanceMatrix[3].xyz;\ntransformed.x += sin(uTime * 1.4 + ip.y * 1.7 + ip.x) * 0.08;');
    };
    const vines = new THREE.InstancedMesh(leafGeo, vm, leaves.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), tint = new THREE.Color();
    leaves.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
      m4.compose(p, q, new THREE.Vector3().setScalar(1.1 + Math.random() * 1.0));
      vines.setMatrixAt(i, m4);
      tint.setHSL(0.27 + Math.random() * 0.06, 0.6, 0.35 + Math.random() * 0.2);
      vines.setColorAt(i, tint);
    });
    vines.castShadow = true;
    g.add(vines);
    ticks.push((t) => { uTime.value = t; });

    // espada en la piedra, junto a la cueva
    const sx = cx - CAVE.dz * 5.5 - CAVE.dx * 2, sz = cz + CAVE.dx * 5.5 - CAVE.dz * 2; // a un lado de la boca
    const s = new THREE.Group(); s.position.set(sx, heightAt(sx, sz), sz);
    add(s, rock(0.7, 4, 0.7), GREY_D, 0, 0.3, 0);
    const steel = new THREE.MeshStandardMaterial({ userData: { unique: true }, color: '#cfe3f5', metalness: 0.8, roughness: 0.25, emissive: '#5aa9ff', emissiveIntensity: 0.35 });
    add(s, new THREE.BoxGeometry(0.1, 1.3, 0.03), steel, 0, 1.15, 0);
    add(s, new THREE.BoxGeometry(0.5, 0.07, 0.08), mat('#c8a24a', { metalness: 0.6 }), 0, 1.85, 0);
    add(s, new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6), mat('#4a2c1a'), 0, 2.06, 0);
    s.rotation.y = Math.random() * 6;
    scene.add(s);
    obstacles.push({ x: sx, z: sz, r: 0.8 });
    ticks.push((t) => { steel.emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.3; });
  }

  // los helechos de la cueva y el barco los pone nature.ts (con viento y se apartan al pasar)

  /* ---------- tablones flotando en la cala ---------- */
  {
    const plank = new THREE.BoxGeometry(1.1, 0.07, 0.22);
    const floaters: { m: THREE.Mesh; x: number; z: number; ph: number }[] = [];
    let guard = 0;
    while (floaters.length < 7 && guard++ < 500) {
      const aa = 1.75 + (Math.random() - 0.5) * 0.7, rr = islandRadius(aa) + 1 + Math.random() * 5;
      const x = Math.cos(aa) * rr, z = Math.sin(aa) * rr;
      if (heightAt(x, z) > -0.35) continue;
      const m = add(scene, plank, floaters.length % 2 ? WOOD : WOOD_D, x, 0, z);
      m.userData.dynamic = true;
      m.rotation.y = Math.random() * 3;
      floaters.push({ m, x, z, ph: Math.random() * 6 });
    }
    ticks.push((t) => {
      for (const f of floaters) {
        f.m.position.y = waveHeight(f.x, f.z, t) + 0.04;
        f.m.rotation.z = Math.sin(t * 1.3 + f.ph) * 0.08;
        f.m.rotation.x = Math.cos(t * 1.1 + f.ph) * 0.06;
      }
    });
  }

  return { obstacles, update: (t) => { for (const f of ticks) f(t); } };
}
