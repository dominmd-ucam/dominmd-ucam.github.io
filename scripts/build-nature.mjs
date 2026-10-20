// Prepara los modelos de naturaleza para la web:
//  · Stylized Nature MegaKit (Quaternius, CC0): los modelos elegidos en un solo public/models/nature/megakit.glb, un nodo por modelo.
//  · Modelos de Sketchfab (CC-BY 4.0, créditos en CREDITS.md): un .glb por modelo, sin el disco de suelo que traen.
// Texturas a WebP de 512 px, sin mapas normales ni de rugosidad (el sombreado toon no los usa) y mallas Meshopt.
// Uso: node scripts/build-nature.mjs "ruta/Stylized Nature MegaKit[Standard]/glTF" "ruta/carpeta-con-los-de-sketchfab"
import { mkdirSync, statSync } from 'node:fs';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, flatten, join, weld, simplify, textureCompress, mergeDocuments, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [MEGA, SKETCH] = process.argv.slice(2);
if (!MEGA) { console.error('Uso: node scripts/build-nature.mjs <MegaKit/glTF> [carpeta Sketchfab]'); process.exit(1); }
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const OUT = 'public/models/nature';
mkdirSync(OUT, { recursive: true });

const MEGAKIT = [
  ...[1, 2, 3, 4, 5].map((i) => `CommonTree_${i}`), ...[1, 2, 3, 4, 5].map((i) => `Pine_${i}`),
  ...[1, 2, 3].map((i) => `TwistedTree_${i}`), ...[1, 2].map((i) => `DeadTree_${i}`),
  'Bush_Common', 'Bush_Common_Flowers', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
  'RockPath_Round_Small_1', 'RockPath_Round_Small_2', 'RockPath_Round_Small_3', 'RockPath_Round_Wide', 'RockPath_Round_Thin',
  'Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Fern_1', 'Flower_3_Group', 'Flower_4_Group',
  'Mushroom_Common', 'Mushroom_Laetiporus', 'Plant_1', 'Plant_7', 'Clover_1',
];

/** Quita mapas que el toon no usa y deja la textura base a `size` px en WebP. */
async function slim(doc, size) {
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(0.9);
  }
  await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }));
}

async function finish(doc, file) {
  await doc.transform(weld(), prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(file, doc);
  console.log(file, `${(statSync(file).size / 1024).toFixed(0)} KB`);
}

// ---------- MegaKit: un documento con un nodo raíz por modelo ----------
const kit = new Document();
const scene = kit.createScene('MegaKit');
for (const name of MEGAKIT) {
  const src = await io.read(`${MEGA}/${name}.gltf`);
  const roots = src.getRoot().listScenes()[0].listChildren();
  const map = mergeDocuments(kit, src);
  const holder = kit.createNode(name);
  for (const r of roots) holder.addChild(map.get(r));
  scene.addChild(holder);
  for (const s of kit.getRoot().listScenes()) if (s !== scene) s.dispose();
}
for (const b of kit.getRoot().listBuffers().slice(1)) b.dispose();
const buf = kit.getRoot().listBuffers()[0];
for (const a of kit.getRoot().listAccessors()) a.setBuffer(buf);
await slim(kit, 512);
// a la distancia a la que se ven, los árboles aguantan la mitad de triángulos sin cambiar de silueta
await kit.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.004 }));
await finish(kit, `${OUT}/megakit.glb`);

// ---------- Sketchfab ----------
const SKETCHFAB = [
  // carpeta, salida, textura, fracción de triángulos que se conserva
  ['cartoon_fallen_tree', 'fallen-tree', 512, 1],
  ['mossy_stump', 'mossy-stump', 512, 0.5],
  ['stylized_tree_stump', 'tree-stump', 512, 1],
  ['stylized_mini_floating_island', 'floating-island', 512, 0.15],
];
if (SKETCH) for (const [dir, out, size, keep] of SKETCHFAB) {
  let doc;
  try { doc = await io.read(`${SKETCH}/${dir}/scene.gltf`); } catch { console.warn('no está', dir); continue; }
  // el disco de suelo de la escena de Sketchfab sobra: el terreno ya es nuestro
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh();
    if (mesh && mesh.listPrimitives().every((p) => /^floor/i.test(p.getMaterial()?.getName() ?? ''))) n.setMesh(null);
  }
  await slim(doc, size);
  await doc.transform(prune(), flatten(), join({ keepNamed: false }), weld());
  if (keep < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: keep, error: 0.02, lockBorder: false }));
  await finish(doc, `${OUT}/${out}.glb`);
}
