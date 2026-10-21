/**
 * Añade a public/models/nature/megakit.glb versiones simplificadas de la corteza de los árboles (nodos "<modelo>_LOD").
 * nature.ts las usa a partir de LOD_DIST metros: la corteza de los árboles del kit tiene entre 1,6k y 7k triángulos y de lejos no se nota.
 * Uso: node scripts/megakit-lod.mjs [ratio=0.25]. Si el archivo ya tiene nodos _LOD, se rehacen.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, meshopt, prune, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const FILE = 'public/models/nature/megakit.glb';
const ratio = Number(process.argv[2] ?? 0.25);
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const base = await io.read(FILE);
const scene = base.getRoot().listScenes()[0];
for (const n of scene.listChildren()) if (n.getName().endsWith('_LOD')) n.dispose();
await base.transform(prune());

// copia solo con los árboles, sin hojas (las tarjetas de hojas con transparencia se rompen al simplificarlas)
const lod = await io.read(FILE);
const lscene = lod.getRoot().listScenes()[0];
for (const n of lscene.listChildren()) {
  if (n.getName().endsWith('_LOD') || !/Tree|Pine/.test(n.getName())) { n.dispose(); continue; }
  n.setName(`${n.getName()}_LOD`);
  n.traverse((c) => {
    const m = c.getMesh();
    if (m) for (const p of m.listPrimitives()) if (!/^Bark/.test(p.getMaterial()?.getName() ?? '')) p.dispose();
  });
}
await lod.transform(prune(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 }));

// se juntan: los nodos _LOD reutilizan los materiales del kit por nombre
const map = mergeDocuments(base, lod);
const lodScene = map.get(lscene);
const byName = new Map(base.getRoot().listMaterials().filter((m) => !map.has(m) || true).map((m) => [m.getName(), m]));
for (const n of lodScene.listChildren()) { scene.addChild(n); n.traverse((c) => { for (const p of c.getMesh()?.listPrimitives() ?? []) { const mt = p.getMaterial(); const keep = mt && byName.get(mt.getName()); if (keep && keep !== mt) p.setMaterial(keep); } }); }
lodScene.dispose();
await base.transform(prune(), unpartition(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(FILE, base);
