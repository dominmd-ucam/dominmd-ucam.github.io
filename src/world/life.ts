import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, ISLAND_R } from './terrain';
import { batchStatic } from './batch';
import { buildFlock } from './flock';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface Life {
  update(t: number, dt: number, player: THREE.Vector3, night: number, skyTint: THREE.Color): void;
}

export function buildLife(scene: THREE.Scene, gullCount = 60): Life {
  /* ---------- nubes ---------- */
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 1, fog: false });
  const clouds: { g: THREE.Group; speed: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 3);
    const geos: THREE.BufferGeometry[] = [];
    for (let j = 0; j < n; j++) {
      const s = rnd(3.5, 7);
      const geo = new THREE.SphereGeometry(s, 14, 10);
      geo.scale(1, 0.55, 1);
      geo.translate((j - n / 2) * 5.2 + rnd(-1, 1), rnd(0, 2) + (j % 2) * 1.2, rnd(-2.5, 2.5));
      geos.push(geo);
    }
    g.add(new THREE.Mesh(mergeGeometries(geos)!, cloudMat)); // una malla por nube
    const a = Math.random() * Math.PI * 2, d = rnd(80, 230);
    g.position.set(Math.cos(a) * d, rnd(45, 75), Math.sin(a) * d);
    g.rotation.y = Math.random() * 3;
    scene.add(g);
    clouds.push({ g, speed: rnd(0.8, 1.8) });
  }

  /* ---------- gaviotas: bandada con boids (ver flock.ts) ---------- */
  const flock = buildFlock(scene, gullCount);

  /* ---------- cangrejos ---------- */
  const crabMat = new THREE.MeshStandardMaterial({ color: '#ee5a3c', roughness: 0.6, flatShading: true });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a' });
  const crabs: { g: THREE.Group; vx: number; vz: number; wait: number }[] = [];
  let guard = 0;
  while (crabs.length < 14 && guard++ < 3000) {
    const R = ISLAND_R * 1.05, x = rnd(-R, R), z = rnd(-R, R), h = heightAt(x, z);
    if (h < 0.15 || h > 0.7) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), crabMat); body.scale.set(1.3, 0.6, 1); body.position.y = 0.12; body.castShadow = true; g.add(body);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), crabMat); claw.position.set(0.3 * s, 0.14, 0.14); g.add(claw);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat); eye.position.set(0.07 * s, 0.24, 0.12); g.add(eye);
    }
    g.position.set(x, h, z); g.rotation.y = Math.random() * 6;
    batchStatic(g); // cuerpo, pinzas y ojos: 2 mallas por cangrejo en vez de 6
    scene.add(g);
    crabs.push({ g, vx: 0, vz: 0, wait: Math.random() * 3 });
  }

  /* ---------- peces ---------- */
  const fishGeo = new THREE.ConeGeometry(0.07, 0.34, 5); fishGeo.rotateX(Math.PI / 2);
  const FISH = 38;
  // Destello plateado (flashing): al girar o asustarse, el costado reflectante del pez brilla y el destello se contagia a los vecinos
  const flashAttr = new THREE.InstancedBufferAttribute(new Float32Array(FISH), 1);
  flashAttr.setUsage(THREE.DynamicDrawUsage);
  fishGeo.setAttribute('aFlash', flashAttr);
  // se dibujan después del agua y con opacidad parcial: el agua es casi opaca a esta profundidad y, si no, ni los peces ni su destello se verían
  const fishMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.62, depthWrite: false });
  fishMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlash; varying float vFlash;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // brilla el costado (normal lateral) cuando mira a la cámara: así se ve el destello, como en los documentales
        vec3 vn = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vFlash = aFlash * abs(normal.x) * pow(abs(vn.z), 0.7);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // por encima de 1: el agua lo atenúa y el bloom lo recoge
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(5.5, 5.8, 6.0), clamp(vFlash * 1.4, 0.0, 1.0));`);
  };
  const fishMesh = new THREE.InstancedMesh(fishGeo, fishMat, FISH);
  fishMesh.frustumCulled = false;
  fishMesh.renderOrder = 5;
  const palette = ['#ffb347', '#ff7a59', '#ffe27a', '#7ad7ff'].map((c) => new THREE.Color(c));
  const school: { cx: number; cz: number; r: number; sp: number; ph: number; dy: number; fx: number; fz: number; scare: number; flash: number; pend: number; cool: number; px: number; pz: number }[] = [];
  guard = 0;
  while (school.length < FISH && guard++ < 3000) {
    const R = ISLAND_R * 1.15, cx = rnd(-R, R), cz = rnd(-R, R), h = heightAt(cx, cz);
    if (h > -0.9 || h < -2.4) continue;
    const k = school.length;
    school.push({ cx, cz, r: rnd(0.8, 2.6), sp: rnd(0.4, 0.9) * (k % 2 ? 1 : -1), ph: Math.random() * 6, dy: rnd(0.35, 0.8), fx: 0, fz: 0, scare: 0, flash: 0, pend: -1, cool: 0, px: 0, pz: 0 });
    fishMesh.setColorAt(k, palette[k % palette.length]);
  }
  fishMesh.count = school.length;
  scene.add(fishMesh);
  const dummy = new THREE.Object3D();

  const cloudNight = new THREE.Color('#5a6a99'), tmp = new THREE.Color(), WHITE = new THREE.Color('#ffffff');

  return {
    update(t, dt, player, night, skyTint) {
      // nubes: se tiñen con el cielo y se oscurecen de noche
      tmp.copy(skyTint).lerp(WHITE, 0.6).lerp(cloudNight, night);
      cloudMat.color.copy(tmp);
      cloudMat.emissive.copy(tmp);
      cloudMat.emissiveIntensity = 0.45 - night * 0.3;
      for (const c of clouds) { c.g.position.x += c.speed * dt; if (c.g.position.x > 260) c.g.position.x = -260; }

      flock.update(t, dt);

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

      // Cardumen: cuando te acercas huyen en abanico (efecto fuente) y vuelven poco a poco a su ronda
      for (let i = 0; i < school.length; i++) {
        const f = school[i];
        const a = t * f.sp + f.ph;
        let x = f.cx + Math.cos(a) * f.r, z = f.cz + Math.sin(a) * f.r;
        const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz);
        if (d < 4.5) {
          if (f.scare < 0.05 && f.pend < 0) f.pend = Math.random() * 0.25; // empieza a huir: destello con un pequeño retardo
          f.scare = Math.min(1, f.scare + dt * 5); f.fx = dx / (d || 1); f.fz = dz / (d || 1);
        } else f.scare = Math.max(0, f.scare - dt * 0.35);

        // Flashing: el destello nace al asustarse (o al azar, como el centelleo de un banco) y salta a los vecinos con un retardo → onda de brillo
        f.cool -= dt;
        f.flash *= Math.exp(-dt * 3.6);
        if (f.pend >= 0 && (f.pend -= dt) < 0) { f.flash = 1; f.pend = -1; f.cool = 1.2; }
        else if (f.cool <= 0 && f.pend < 0) {
          if (Math.random() < dt * 0.05) f.flash = 0.75;
          else if (f.flash < 0.15) {
            for (let k = 0; k < school.length; k++) {
              const o = school[k];
              if (o.flash > 0.6 && (o.px - f.px) ** 2 + (o.pz - f.pz) ** 2 < 9) { f.pend = 0.1 + Math.random() * 0.08; break; }
            }
          }
        }
        flashAttr.setX(i, f.flash);
        f.px = x; f.pz = z;
        const push = f.scare * 3.2;
        x += f.fx * push; z += f.fz * push;
        const floor = heightAt(x, z);
        dummy.position.set(x, Math.max(floor + f.dy + f.scare * 0.25, -1.4), z);
        dummy.rotation.set(0, f.scare > 0.05 ? Math.atan2(f.fx, f.fz) : -a + (f.sp > 0 ? 0 : Math.PI) + Math.PI, Math.sin(t * (9 + f.scare * 14) + i) * 0.15);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
      }
      fishMesh.instanceMatrix.needsUpdate = true;
      flashAttr.needsUpdate = true;
    },
  };
}
