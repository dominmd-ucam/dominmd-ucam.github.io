// Prepara los modelos que salen de Blender (scripts/blender/*.py: personajes y casas) para la web: textura base a WebP, sin mapas que el
// toon no usa, materiales repetidos fundidos (una malla por material) y Meshopt.
// Uso: node scripts/build-glb.mjs entrada.glb salida.glb [px de textura]
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, join, prune, weld, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [src, out, px = '512'] = process.argv.slice(2);
if (!src || !out) { console.error('Uso: node scripts/build-glb.mjs entrada.glb salida.glb [px]'); process.exit(1); }
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
for (const m of doc.getRoot().listMaterials()) {
  m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
  m.setMetallicFactor(0).setRoughnessFactor(0.75);
}
await doc.transform(prune(), dedup(), join(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+px, +px], quality: 85 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(out, doc);
console.log(out, `${(statSync(out).size / 1024).toFixed(0)} KB`);
