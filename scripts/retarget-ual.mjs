// Pasa las animaciones de la Universal Animation Library (Quaternius, CC0; esqueleto tipo Unreal) al esqueleto Mixamo del avatar
// y las guarda en public/models/avatar/Moves.glb.
// Uso: node scripts/retarget-ual.mjs "ruta/a/UAL1_Standard.glb"
//
// Método: para cada hueso se copia el giro en el mundo respecto a la pose de reposo (las dos vienen en T y miran a +Z),
// corrigiendo antes la dirección de reposo de cada hueso del destino para que apunte igual que en el origen (los brazos de Mixamo caen unos 11°).
// La cadera conserva su altura relativa (el avatar tiene las piernas más cortas).
import * as THREE from 'three';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { resample, dedup, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder, 'draco3d.decoder': await draco3d.createDecoderModule(),
});

const SRC = process.argv[2];
if (!SRC) { console.error('Falta la ruta de UAL1_Standard.glb'); process.exit(1); }
const TARGET = 'public/models/avatar/Armature.glb';
const OUT = 'public/models/avatar/Moves.glb';
const FPS = 30;

/** clip de la librería → nombre que usa el juego */
const CLIPS = {
  Idle_Loop: 'Idle', Walk_Loop: 'Walk', Jog_Fwd_Loop: 'Run', Sprint_Loop: 'Sprint',
  Jump_Start: 'JumpStart', Jump_Loop: 'JumpLoop', Jump_Land: 'JumpLand',
  Crouch_Idle_Loop: 'CrouchIdle', Crouch_Fwd_Loop: 'CrouchWalk', Roll: 'Roll',
  Swim_Idle_Loop: 'SwimIdle', Swim_Fwd_Loop: 'Swim', Interact: 'Interact', Dance_Loop: 'Dance',
};

const BONES = { pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head' };
for (const [s, side] of [['l', 'Left'], ['r', 'Right']]) {
  Object.assign(BONES, {
    [`clavicle_${s}`]: `${side}Shoulder`, [`upperarm_${s}`]: `${side}Arm`, [`lowerarm_${s}`]: `${side}ForeArm`, [`hand_${s}`]: `${side}Hand`,
    [`thigh_${s}`]: `${side}UpLeg`, [`calf_${s}`]: `${side}Leg`, [`foot_${s}`]: `${side}Foot`, [`ball_${s}`]: `${side}ToeBase`,
  });
  for (const [f, F] of [['thumb', 'Thumb'], ['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky']])
    for (let i = 1; i <= 3; i++) BONES[`${f}_0${i}_${s}`] = `${side}Hand${F}${i}`;
}
for (const k in BONES) BONES[k] = `mixamorig${BONES[k]}`;

/** Jerarquía THREE con los nodos del glTF (sin mallas) y sus clips. */
async function rig(file) {
  const doc = await io.read(file), root = doc.getRoot();
  const map = new Map();
  const mk = (n) => {
    const o = new THREE.Object3D();
    o.name = THREE.PropertyBinding.sanitizeNodeName(n.getName());
    o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale());
    map.set(n, o);
    for (const c of n.listChildren()) o.add(mk(c));
    return o;
  };
  const scene = new THREE.Group();
  for (const n of root.listScenes()[0].listChildren()) scene.add(mk(n));
  const clips = root.listAnimations().map((a) => new THREE.AnimationClip(a.getName(), -1, a.listChannels().map((c) => {
    const s = c.getSampler(), path = c.getTargetPath(), name = map.get(c.getTargetNode()).name;
    const T = path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    const prop = path === 'rotation' ? 'quaternion' : path === 'translation' ? 'position' : 'scale';
    return new T(`${name}.${prop}`, Array.from(s.getInput().getArray()), Array.from(s.getOutput().getArray()));
  })));
  scene.updateMatrixWorld(true);
  return { doc, scene, clips, map };
}

const src = await rig(SRC), dst = await rig(TARGET);
const sObj = (n) => src.scene.getObjectByName(n), dObj = (n) => dst.scene.getObjectByName(n);
const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o) => o.getWorldPosition(new THREE.Vector3());

// hijo principal de cada hueso (para la dirección del hueso)
const NEXT = {};
for (const s of Object.keys(BONES)) {
  const kids = sObj(s).children.map((c) => c.name).filter((n) => BONES[n]);
  const pick = kids.find((n) => /spine|neck|Head|lowerarm|hand|calf|foot|ball|_0[23]_|upperarm/.test(n) && !/clavicle|thigh/.test(n)) ?? kids[0];
  if (pick) NEXT[s] = pick;
}

// reposo: giros en el mundo y corrección de dirección por hueso
const rest = {};
for (const [s, d] of Object.entries(BONES)) {
  const so = sObj(s), dobj = dObj(d);
  if (!so || !dobj) { console.warn('sin hueso', s, d); continue; }
  const qs = wq(so), qd = wq(dobj);
  let fix = new THREE.Quaternion();
  const n = NEXT[s];
  if (n && dObj(BONES[n])) {
    const ds = wp(sObj(n)).sub(wp(so)).normalize(), dd = wp(dObj(BONES[n])).sub(wp(dobj)).normalize();
    fix.setFromUnitVectors(dd, ds);
  }
  rest[s] = { qsInv: qs.clone().invert(), qd: fix.multiply(qd) };
}
const hipsRestS = wp(sObj('pelvis')), hipsRestD = wp(dObj('mixamorigHips'));
const hipsK = hipsRestD.y / hipsRestS.y;

// orden padre→hijo en el destino
const order = [];
dst.scene.traverse((o) => { const s = Object.keys(BONES).find((k) => BONES[k] === o.name); if (s && rest[s]) order.push([s, o]); });

const out = new Document();
const buffer = out.createBuffer();
// copia la jerarquía de nodos del destino (solo transformaciones)
const nodeOf = new Map();
const copy = (o) => {
  const n = out.createNode(o.name).setTranslation(o.position.toArray()).setRotation(o.quaternion.toArray()).setScale(o.scale.toArray());
  nodeOf.set(o.name, n);
  for (const c of o.children) n.addChild(copy(c));
  return n;
};
const outScene = out.createScene();
for (const o of dst.scene.children) outScene.addChild(copy(o));

const mixer = new THREE.AnimationMixer(src.scene);
const tmpQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
for (const [from, name] of Object.entries(CLIPS)) {
  const clip = src.clips.find((c) => c.name === from);
  if (!clip) { console.warn('no está', from); continue; }
  mixer.stopAllAction(); mixer.uncacheRoot(src.scene);
  const act = mixer.clipAction(clip); act.play();
  const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const times = new Float32Array(frames);
  const rot = new Map(order.map(([, o]) => [o.name, new Float32Array(frames * 4)]));
  const hipsPos = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / FPS);
    times[f] = t;
    mixer.setTime(t); src.scene.updateMatrixWorld(true);
    for (const [s, o] of order) {
      // giro objetivo en el mundo = (giro del origen respecto a su reposo) · reposo corregido del destino
      tmpQ.copy(wq(sObj(s))).multiply(rest[s].qsInv).multiply(rest[s].qd);
      o.parent.getWorldQuaternion(parentQ);
      o.quaternion.copy(parentQ.invert().multiply(tmpQ));
      o.updateMatrixWorld(true);
      o.quaternion.toArray(rot.get(o.name), f * 4);
    }
    // cadera: desplazamiento respecto al reposo, escalado a la altura del avatar
    const hips = dObj('mixamorigHips');
    const p = wp(sObj('pelvis')).sub(hipsRestS).multiplyScalar(hipsK).add(hipsRestD);
    hips.parent.worldToLocal(tmpV.copy(p));
    tmpV.toArray(hipsPos, f * 3);
  }
  // los bucles cierran exactamente igual que empiezan
  if (/Loop/.test(from)) for (const arr of [...rot.values(), hipsPos]) {
    const n = arr.length / frames; for (let i = 0; i < n; i++) arr[(frames - 1) * n + i] = arr[i];
  }
  const anim = out.createAnimation(name);
  const input = out.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
  for (const [bone, arr] of rot) {
    const smp = out.createAnimationSampler().setInput(input).setOutput(out.createAccessor().setType('VEC4').setArray(arr).setBuffer(buffer)).setInterpolation('LINEAR');
    anim.addSampler(smp).addChannel(out.createAnimationChannel().setTargetNode(nodeOf.get(bone)).setTargetPath('rotation').setSampler(smp));
  }
  const smp = out.createAnimationSampler().setInput(input).setOutput(out.createAccessor().setType('VEC3').setArray(hipsPos).setBuffer(buffer)).setInterpolation('LINEAR');
  anim.addSampler(smp).addChannel(out.createAnimationChannel().setTargetNode(nodeOf.get('mixamorigHips')).setTargetPath('translation').setSampler(smp));
  console.log('·', from, '→', name, `${clip.duration.toFixed(2)} s`);
}

await out.transform(resample({ tolerance: 2e-4 }), dedup(), prune({ keepLeaves: true }));
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(OUT, out);
const { statSync } = await import('node:fs');
console.log(OUT, `${(statSync(OUT).size / 1024).toFixed(0)} KB`);
