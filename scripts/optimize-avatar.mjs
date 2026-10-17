// Comprime las piezas del avatar (assets-src/avatar → public/models/avatar) con Draco.
// Armature.glb y Poses.glb se copian sin tocar (esqueleto y animaciones).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const SRC = 'assets-src/avatar', OUT = 'public/models/avatar';
mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
let before = 0, after = 0;
for (const f of readdirSync(SRC).filter((f) => f.endsWith('.glb'))) {
  before += statSync(`${SRC}/${f}`).size;
  if (f === 'Armature.glb' || f === 'Poses.glb') copyFileSync(`${SRC}/${f}`, `${OUT}/${f}`);
  else {
    const doc = await io.read(`${SRC}/${f}`);
    await doc.transform(dedup(), draco());
    await io.write(`${OUT}/${f}`, doc);
  }
  after += statSync(`${OUT}/${f}`).size;
}
console.log(`avatar: ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
