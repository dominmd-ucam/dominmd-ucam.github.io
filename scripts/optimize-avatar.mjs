/**
 * Optimiza las piezas GLB del avatar (public/models/avatar). Las cifras de abajo son las de la pasada de octubre de 2026: 10,9 MB → 4,3 MB.
 *
 * Qué hace con cada archivo:
 *  - quita los morph targets (ninguna parte del código los usa; en las cabezas eran 590 KB de 626 KB porque Draco no los comprime)
 *  - texturas PNG → WebP (calidad 80, máx. 1024 px): Outfit.002 pasa de 1,9 MB a 190 KB y PumpkinHead de 930 KB a 93 KB
 *  - prune + dedup (elimina datos y materiales duplicados sin usar) y vuelve a comprimir la geometría con Draco
 *  - Poses.glb: solo se conserva "Idle" (es la única pose que usa el código) y se comprime con meshopt: 643 KB → 216 KB
 *
 * Es una herramienta puntual y no está entre las dependencias del proyecto. Para ejecutarla:
 *   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions draco3dgltf meshoptimizer sharp
 *   node scripts/optimize-avatar.mjs public/models/avatar /ruta/salida
 * y luego se revisa el resultado y se copia sobre public/models/avatar.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, textureCompress, draco, meshopt } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('Uso: node scripts/optimize-avatar.mjs <carpeta origen> <carpeta destino>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});

let before = 0, after = 0;
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.glb')).sort()) {
  const doc = await io.read(path.join(src, f));
  const root = doc.getRoot();
  for (const m of root.listMeshes()) {
    for (const p of m.listPrimitives()) for (const t of p.listTargets()) { p.removeTarget(t); t.dispose(); }
    m.setWeights([]);
  }
  const animOnly = root.listAnimations().length > 0 && root.listMeshes().length === 0;
  if (animOnly) for (const a of root.listAnimations()) if (a.getName() !== 'Idle') a.dispose();
  const steps = [prune(), dedup()];
  if (root.listAnimations().length) steps.push(resample());
  if (root.listTextures().length) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [1024, 1024] }));
  if (animOnly) steps.push(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  else if (root.listMeshes().length) steps.push(draco());
  await doc.transform(...steps);
  const dst = path.join(out, f);
  await io.write(dst, doc);
  before += fs.statSync(path.join(src, f)).size; after += fs.statSync(dst).size;
}
console.log(`TOTAL ${before} → ${after} bytes (${Math.round((1 - after / before) * 100)} % menos)`);
