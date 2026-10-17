import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type StdMat = THREE.MeshStandardMaterial;

/** Firma de un material: los que son idénticos (mismo color, rugosidad…) comparten malla fusionada. */
function signature(m: THREE.Material): string {
  if (m.userData.unique) return m.uuid; // materiales que se animan en tiempo de ejecución no se fusionan con otros
  const s = m as StdMat;
  if (!s.isMeshStandardMaterial) return m.uuid;
  return [s.color.getHex(), s.roughness, s.metalness, s.emissive.getHex(), s.emissiveIntensity, s.flatShading, s.side, s.transparent, s.opacity, s.vertexColors, s.map?.uuid ?? '', s.onBeforeCompile === THREE.Material.prototype.onBeforeCompile ? '' : m.uuid].join('|');
}

/**
 * Fusiona las mallas estáticas de `root` en una sola malla por material (y atributos).
 * Reduce llamadas de dibujo (y de la pasada de sombras) sin cambiar el aspecto.
 * Se saltan las instancias, mallas con esqueleto, materiales múltiples y todo lo marcado con `userData.dynamic`.
 */
export function batchStatic(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const dynamic = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) {
      if (p.userData.dynamic) return true;
      if (p === root) break;
    }
    return false;
  };
  interface Bucket { material: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; meshes: THREE.Mesh[] }
  const buckets = new Map<string, Bucket>();

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    if ((m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(m.material) || dynamic(m)) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.deleteAttribute('uv'); g.deleteAttribute('uv1');
    const attrs = Object.keys(g.attributes).sort().join(',');
    rel.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(rel);
    const key = `${signature(m.material)}#${attrs}`;
    let b = buckets.get(key);
    if (!b) { b = { material: m.material, geos: [], cast: false, meshes: [] }; buckets.set(key, b); }
    b.geos.push(g);
    b.cast ||= m.castShadow;
    b.meshes.push(m);
  });

  let merged = 0;
  for (const b of buckets.values()) {
    const geo = b.geos.length > 1 ? mergeGeometries(b.geos) : b.geos[0];
    if (!geo) continue; // atributos incompatibles: se dejan sueltas
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    root.add(mesh);
    for (const m of b.meshes) m.parent?.remove(m);
    merged += b.meshes.length;
  }
  return merged;
}
