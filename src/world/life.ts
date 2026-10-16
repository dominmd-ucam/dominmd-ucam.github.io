import * as THREE from 'three';
import { heightAt } from './terrain';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface Life {
  update(t: number, dt: number, player: THREE.Vector3, night: number, skyTint: THREE.Color): void;
}

export function buildLife(scene: THREE.Scene): Life {
  /* ---------- nubes ---------- */
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 1, fog: false });
  const clouds: { g: THREE.Group; speed: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const s = rnd(3.5, 7);
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 10), cloudMat);
      m.position.set((j - n / 2) * 5.2 + rnd(-1, 1), rnd(0, 2) + (j % 2) * 1.2, rnd(-2.5, 2.5));
      m.scale.y = 0.55;
      g.add(m);
    }
    const a = Math.random() * Math.PI * 2, d = rnd(80, 230);
    g.position.set(Math.cos(a) * d, rnd(45, 75), Math.sin(a) * d);
    g.rotation.y = Math.random() * 3;
    scene.add(g);
    clouds.push({ g, speed: rnd(0.8, 1.8) });
  }

  /* ---------- gaviotas ---------- */
  const gullBody = new THREE.MeshStandardMaterial({ color: '#fbfbf6', roughness: 0.7, flatShading: true });
  const gullTip = new THREE.MeshStandardMaterial({ color: '#7d8a93', roughness: 0.7, flatShading: true, side: THREE.DoubleSide });
  const wingGeo = (side: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.2, 0, 0, 0.26, side * 1.25, 0.04, -0.05], 3));
    g.computeVertexNormals();
    return g;
  };
  const gulls = Array.from({ length: 6 }, (_, i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.7, 5), gullBody); body.rotation.x = Math.PI / 2; g.add(body);
    const wl = new THREE.Group(), wr = new THREE.Group();
    wl.add(new THREE.Mesh(wingGeo(-1), i % 2 ? gullBody : gullTip));
    wr.add(new THREE.Mesh(wingGeo(1), i % 2 ? gullBody : gullTip));
    g.add(wl, wr);
    g.scale.setScalar(rnd(1.2, 1.7));
    scene.add(g);
    return { g, wl, wr, r: rnd(14, 38), h: rnd(14, 28), sp: rnd(0.12, 0.22) * (i % 2 ? 1 : -1), a: Math.random() * 6, cx: rnd(-8, 8), cz: rnd(-8, 8), ph: Math.random() * 6 };
  });

  /* ---------- cangrejos ---------- */
  const crabMat = new THREE.MeshStandardMaterial({ color: '#ee5a3c', roughness: 0.6, flatShading: true });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a' });
  const crabs: { g: THREE.Group; vx: number; vz: number; wait: number }[] = [];
  let guard = 0;
  while (crabs.length < 9 && guard++ < 400) {
    const x = rnd(-30, 30), z = rnd(-30, 30), h = heightAt(x, z);
    if (h < 0.15 || h > 0.7) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), crabMat); body.scale.set(1.3, 0.6, 1); body.position.y = 0.12; body.castShadow = true; g.add(body);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), crabMat); claw.position.set(0.3 * s, 0.14, 0.14); g.add(claw);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat); eye.position.set(0.07 * s, 0.24, 0.12); g.add(eye);
    }
    g.position.set(x, h, z); g.rotation.y = Math.random() * 6;
    scene.add(g);
    crabs.push({ g, vx: 0, vz: 0, wait: Math.random() * 3 });
  }

  /* ---------- peces ---------- */
  const fishGeo = new THREE.ConeGeometry(0.07, 0.34, 5); fishGeo.rotateX(Math.PI / 2);
  const FISH = 38;
  const fishMesh = new THREE.InstancedMesh(fishGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), FISH);
  fishMesh.frustumCulled = false;
  const palette = ['#ffb347', '#ff7a59', '#ffe27a', '#7ad7ff'].map((c) => new THREE.Color(c));
  const school: { cx: number; cz: number; r: number; sp: number; ph: number; dy: number }[] = [];
  guard = 0;
  while (school.length < FISH && guard++ < 3000) {
    const cx = rnd(-34, 34), cz = rnd(-34, 34), h = heightAt(cx, cz);
    if (h > -0.9 || h < -2.4) continue;
    const k = school.length;
    school.push({ cx, cz, r: rnd(0.8, 2.6), sp: rnd(0.4, 0.9) * (k % 2 ? 1 : -1), ph: Math.random() * 6, dy: rnd(0.35, 0.8) });
    fishMesh.setColorAt(k, palette[k % palette.length]);
  }
  fishMesh.count = school.length;
  scene.add(fishMesh);
  const dummy = new THREE.Object3D();

  const cloudNight = new THREE.Color('#5a6a99'), tmp = new THREE.Color();

  return {
    update(t, dt, player, night, skyTint) {
      // nubes: se tiñen con el cielo y se oscurecen de noche
      tmp.copy(skyTint).lerp(new THREE.Color('#ffffff'), 0.6).lerp(cloudNight, night);
      cloudMat.color.copy(tmp);
      cloudMat.emissive.copy(tmp);
      cloudMat.emissiveIntensity = 0.45 - night * 0.3;
      for (const c of clouds) { c.g.position.x += c.speed * dt; if (c.g.position.x > 260) c.g.position.x = -260; }

      for (const b of gulls) {
        b.a += b.sp * dt;
        const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
        const y = b.h + Math.sin(t * 0.5 + b.ph) * 1.4;
        b.g.position.set(x, y, z);
        b.g.rotation.y = -b.a + (b.sp > 0 ? 0 : Math.PI);
        b.g.rotation.z = (b.sp > 0 ? -1 : 1) * 0.35;
        const f = Math.sin(t * 5 + b.ph) * 0.5 * (0.4 + 0.6 * Math.sin(t * 0.7 + b.ph) ** 2);
        b.wl.rotation.z = -f; b.wr.rotation.z = f;
        b.g.visible = night < 0.85;
      }

      for (const c of crabs) {
        const p = c.g.position;
        const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
        c.wait -= dt;
        if (d < 4) { c.vx = (dx / d) * 2.4; c.vz = (dz / d) * 2.4; c.wait = 0.8; }
        else if (c.wait <= 0) {
          const a = Math.random() * 6.28, sp = Math.random() < 0.6 ? 0 : 0.7;
          c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.wait = rnd(0.6, 2.2);
        }
        const nx = p.x + c.vx * dt, nz = p.z + c.vz * dt, nh = heightAt(nx, nz);
        if (nh > 0.1 && nh < 0.95) { p.x = nx; p.z = nz; p.y = nh; } else { c.vx = -c.vx; c.vz = -c.vz; }
        if (Math.hypot(c.vx, c.vz) > 0.05) c.g.rotation.y = Math.atan2(c.vx, c.vz) + Math.PI / 2; // anda de lado
      }

      school.forEach((f, i) => {
        const a = t * f.sp + f.ph;
        const x = f.cx + Math.cos(a) * f.r, z = f.cz + Math.sin(a) * f.r;
        const floor = heightAt(x, z);
        dummy.position.set(x, Math.max(floor + f.dy, -1.4) , z);
        dummy.rotation.set(0, -a + (f.sp > 0 ? 0 : Math.PI) + Math.PI, Math.sin(t * 9 + i) * 0.15);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
      });
      fishMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
