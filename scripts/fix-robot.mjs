// Repasa el robot "Claude" (Claudito) que sale de scripts/blender/robot.py sin tocar su diseño:
// 1) cierra las grietas que dejó el decimado (bordes abiertos casi pegados): junta cada vértice de borde con el más cercano de
//    enfrente, sin añadir caras, así no aparecen líneas de textura;
// 2) suaviza los pesos del esqueleto en hombros y caderas (eran rígidos, 0 o 1) para que Walk y Wave doblen sin estirar caras.
// 3) frontal plano como una pantalla OLED: la cara del modelo (abombada y con relieves de ojos) se aplasta a ras del marco;
// 4) textura repintada según la forma, no por color: la pantalla negra uniforme y el resto blanco roto limpio, sin las manchas grises
//    del horneado en botones y bordes (la cara de píxeles la pinta robot.ts encima).
// Uso: node scripts/fix-robot.mjs entrada.glb salida.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('Uso: node scripts/fix-robot.mjs entrada.glb salida.glb'); process.exit(1); }
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
await doc.transform(dequantize());
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const POS = prim.getAttribute('POSITION'), JNT = prim.getAttribute('JOINTS_0'), WGT = prim.getAttribute('WEIGHTS_0');
const idx = prim.getIndices().getArray();
const n = POS.getCount();
const pos = [...Array(n)].map((_, i) => POS.getElement(i, []));

// vértices con la misma posición = un mismo punto (las costuras de UV duplican vértices)
const groupOf = (P) => { const m = new Map(), g = []; for (const p of P) { const k = p.map((x) => Math.round(x * 1e5)).join(); if (!m.has(k)) m.set(k, m.size); g.push(m.get(k)); } return g; };
const edgesOpen = (g) => {
  const c = new Map();
  for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const u = g[idx[t + a]], v = g[idx[t + b]]; const k = u < v ? `${u}_${v}` : `${v}_${u}`; c.set(k, (c.get(k) || 0) + 1);
  }
  return [...c].filter(([, v]) => v === 1).map(([k]) => k.split('_').map(Number));
};
let g = groupOf(pos);
const before = edgesOpen(g).length;

// 1) grietas: une vértices de borde a menos de TOL que no compartan arista (a los dos lados de la grieta)
const size = Math.max(...[0, 1, 2].map((c) => Math.max(...pos.map((p) => p[c])) - Math.min(...pos.map((p) => p[c]))));
const TOL = size * 0.006;
for (let pass = 0; pass < 3; pass++) {
  const open = edgesOpen(g); const nb = new Map();
  for (const [a, b] of open) { (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); (nb.get(b) || nb.set(b, new Set()).get(b)).add(a); }
  const rep = new Map(); g.forEach((k, i) => { if (!rep.has(k)) rep.set(k, i); });
  const ids = [...nb.keys()]; const P = (k) => pos[rep.get(k)];
  const cell = (p) => p.map((x) => Math.floor(x / TOL)).join();
  const grid = new Map(); for (const k of ids) { const c = cell(P(k)); (grid.get(c) || grid.set(c, []).get(c)).push(k); }
  const target = new Map();
  for (const k of ids) {
    const p = P(k); let best = null, bd = TOL;
    const [cx, cy, cz] = p.map((x) => Math.floor(x / TOL));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const o of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
      if (o === k || nb.get(k).has(o)) continue;
      const q = P(o); const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = o; }
    }
    if (best !== null) target.set(k, best);
  }
  // une por parejas en el punto medio (unión-búsqueda para no encadenar)
  const parent = new Map(); const find = (x) => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x; };
  for (const [a, b] of target) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }
  const sum = new Map();
  for (const k of ids) { const r = find(k); const s = sum.get(r) || [0, 0, 0, 0]; const p = P(k); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; sum.set(r, s); }
  for (let i = 0; i < n; i++) { if (!nb.has(g[i])) continue; const s = sum.get(find(g[i])); if (s[3] > 1) pos[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; }
  g = groupOf(pos);
}
const after = edgesOpen(g).length;

// 3) frontal plano. Ejes de la malla: +Z es el frente (el esqueleto la gira). El marco blanco llega a z≈0.40; todo lo que
//    sobresale (cristal abombado y relieves) se lleva a ese plano y mira de frente.
const FRONT_Z = 0.405;
const NRM = prim.getAttribute('NORMAL');
const flat = pos.map((p) => p[2] > FRONT_Z);
let nFlat = 0; const sx = [], sy = [];
for (let i = 0; i < n; i++) if (flat[i]) { pos[i] = [pos[i][0], pos[i][1], FRONT_Z]; NRM.setElement(i, [0, 0, 1]); nFlat++; sx.push(pos[i][0]); sy.push(pos[i][1]); }
// medidas de la pantalla en metros del modelo (lo que usa robot.ts), con la matriz de enlace del hueso raíz
const ibm = doc.getRoot().listSkins()[0].getInverseBindMatrices().getElement(0, []);
const toModel = (x, y, z) => [0, 1, 2].map((r) => ibm[r] * x + ibm[4 + r] * y + ibm[8 + r] * z + ibm[12 + r]);
const [SX0, SX1, SY0, SY1] = [Math.min(...sx), Math.max(...sx), Math.min(...sy), Math.max(...sy)];
// cristal: rectángulo redondeado un poco hacia dentro del borde aplanado; lo que hay dentro (abolladuras incluidas) queda plano
const R = 0.14, IN = 0.02;
const inGlass = (x, y, z) => {
  if (z < FRONT_Z - 0.03) return false;
  const dx = Math.max(SX0 + IN + R - x, 0, x - (SX1 - IN - R)), dy = Math.max(SY0 + IN + R - y, 0, y - (SY1 - IN - R));
  return Math.hypot(dx, dy) <= R;
};
for (let i = 0; i < n; i++) if (!flat[i] && inGlass(...pos[i])) { pos[i] = [pos[i][0], pos[i][1], FRONT_Z]; NRM.setElement(i, [0, 0, 1]); flat[i] = true; nFlat++; }
const lo = toModel(Math.min(...sx), Math.min(...sy), FRONT_Z), hi = toModel(Math.max(...sx), Math.max(...sy), FRONT_Z);
console.log(`frontal: ${nFlat} vértices aplanados; pantalla en el modelo x ${lo[0].toFixed(4)}..${hi[0].toFixed(4)} y ${lo[1].toFixed(4)}..${hi[1].toFixed(4)} z ${lo[2].toFixed(4)}`);

// 2) pesos: promedio con los vecinos de la malla, solo cerca de donde se tocan dos huesos
const W = [...Array(n)].map((_, i) => { const j = JNT.getElement(i, []), w = WGT.getElement(i, []), m = new Map(); j.forEach((b, s) => { if (w[s] > 0) m.set(b, (m.get(b) || 0) + w[s]); }); return m; });
const ng = Math.max(...g) + 1; let GW = [...Array(ng)].map(() => new Map());
for (let i = 0; i < n; i++) GW[g[i]] = W[i];
const adj = [...Array(ng)].map(() => new Set());
for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const u = g[idx[t + a]], v = g[idx[t + b]]; if (u !== v) { adj[u].add(v); adj[v].add(u); } }
const ITER = 6;
for (let it = 0; it < ITER; it++) {
  GW = GW.map((m, k) => {
    const acc = new Map(m); for (const o of adj[k]) for (const [b, w] of GW[o]) acc.set(b, (acc.get(b) || 0) + w);
    const tot = [...acc.values()].reduce((x, y) => x + y, 0); for (const b of acc.keys()) acc.set(b, acc.get(b) / tot); return acc;
  });
}
let blended = 0;
for (let i = 0; i < n; i++) {
  const top = [...GW[g[i]]].sort((a, b) => b[1] - a[1]).slice(0, 4).filter(([, w]) => w > 0.01);
  const tot = top.reduce((s, [, w]) => s + w, 0);
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0]; top.forEach(([b, x], s) => { j[s] = b; w[s] = x / tot; });
  if (top.length > 1) blended++;
  JNT.setElement(i, j); WGT.setElement(i, w); POS.setElement(i, pos[i]);
}
// 4) textura por caras: se pinta cada triángulo en su sitio de la UV (2 = pantalla, 1 = carcasa) y luego se colorea
const tex = doc.getRoot().listTextures()[0];
const { data, info } = await sharp(tex.getImage()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const TW = info.width, TH = info.height;
const UV = prim.getAttribute('TEXCOORD_0');
const mask = new Uint8Array(TW * TH);
for (let t = 0; t < idx.length; t += 3) {
  const v = [idx[t], idx[t + 1], idx[t + 2]];
  // pantalla: caras aplanadas o con el centro dentro del cristal (así no quedan motas blancas sueltas en el negro)
  const ctr = [0, 1, 2].map((ax) => (pos[v[0]][ax] + pos[v[1]][ax] + pos[v[2]][ax]) / 3);
  const kind = v.every((i) => flat[i]) || inGlass(...ctr) ? 2 : 1;
  const q = v.map((i) => { const u = UV.getElement(i, []); return [u[0] * TW - 0.5, u[1] * TH - 0.5]; });
  const x0 = Math.max(0, Math.floor(Math.min(...q.map((a) => a[0])))), x1 = Math.min(TW - 1, Math.ceil(Math.max(...q.map((a) => a[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...q.map((a) => a[1])))), y1 = Math.min(TH - 1, Math.ceil(Math.max(...q.map((a) => a[1]))));
  const [a, b, c] = q; const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(den) < 1e-9) continue;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den;
    if (l1 >= -0.02 && l2 >= -0.02 && 1 - l1 - l2 >= -0.02) {
      const k = y * TW + x; if (mask[k] !== 2) mask[k] = kind;
    }
  }
}
// margen: los píxeles sin cara toman el valor del vecino, para que el filtrado no traiga colores de fuera
for (let pass = 0; pass < 6; pass++) {
  const prev = mask.slice();
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const k = y * TW + x; if (prev[k]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < TW && yy < TH && prev[yy * TW + xx]) { mask[k] = prev[yy * TW + xx]; break; } }
  }
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let i = 0, k = 0; i < data.length; i += 4, k++) {
  const l = (0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) / 255;
  // carcasa: blanco roto con un pelín del sombreado horneado (sin bajar de 0.93, así no quedan manchas); pantalla: negro OLED
  const v = mask[k] === 2 ? 0.03 : 0.93 + 0.035 * smooth(0.35, 0.9, l);
  data[i] = Math.round(255 * v); data[i + 1] = Math.round(255 * v * 0.995); data[i + 2] = Math.round(255 * v * 0.985);
}
tex.setImage(await sharp(data, { raw: info }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp');
const mat = doc.getRoot().listMaterials()[0]; mat.setRoughnessFactor(0.45);
console.log(`aristas abiertas ${before} -> ${after}; vértices con pesos mezclados ${blended}/${n}`);
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(out, doc);
