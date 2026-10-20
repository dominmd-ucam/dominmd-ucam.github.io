import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { Dawn } from './world/dawn';
import type { Water } from './world/water';
import type { Post } from './post';

export interface TuneTargets {
  dawn: Dawn;
  scene: THREE.Scene;
  terrain: THREE.Mesh;
  water: Water;
  post: Post;
  grass?: { group: THREE.Object3D };
}

/**
 * Panel de ajuste visual (solo con ?tune): se mueven sliders a ojo en vez de teclear números.
 * "Copiar valores" deja un JSON en el portapapeles para fijar el resultado en el código.
 * Se importa de forma dinámica, así que no pesa nada en el juego normal.
 */
export async function openTune(t: TuneTargets): Promise<void> {
  const { default: GUIClass } = await import('lil-gui');
  const gui: GUI = new GUIClass({ title: 'Ajuste visual (?tune)', width: 290 });
  gui.domElement.style.zIndex = '99999';
  const fog = t.scene.fog as THREE.FogExp2;
  const caus = t.terrain.userData.uCaus as { value: number };
  const fx = t.post.fx;

  const p = {
    exposicion: t.dawn.exposure,
    solElevacion: 14, solAcimut: 145, solIntensidad: t.dawn.sun.intensity, solColor: '#' + t.dawn.sun.color.getHexString(),
    hemiIntensidad: t.dawn.hemi.intensity, entorno: t.scene.environmentIntensity,
    nieblaDensidad: fog.density, nieblaColor: '#' + fog.color.getHexString(),
    saturacion: fx?.hue.saturation ?? 0, contraste: fx?.contrast.contrast ?? 0, brillo: fx?.contrast.brightness ?? 0,
    bloomIntensidad: fx?.bloom.intensity ?? 0, bloomUmbral: fx?.bloom.luminanceMaterial.threshold ?? 0,
    contornos: (fx?.ink.uniforms.get('strength')?.value as number | undefined) ?? 0,
    vinetaOscuridad: fx?.vignette.darkness ?? 0, vinetaRadio: fx?.vignette.offset ?? 0,
    caustica: caus.value,
    aguaSomera: '#' + (t.water.uniformSets[0].uShallow.value as THREE.Color).getHexString(),
    aguaProfunda: '#' + (t.water.uniformSets[0].uDeep.value as THREE.Color).getHexString(),
  };
  const initial = { ...p };

  const sets = <T>(fn: (u: Record<string, THREE.IUniform>) => T) => t.water.uniformSets.forEach(fn);
  const setSun = () => t.dawn.setSun(p.solElevacion, p.solAcimut);

  const luz = gui.addFolder('Luz');
  luz.add(p, 'exposicion', 0.2, 1.2, 0.01).onChange((v: number) => { t.dawn.exposure = v; });
  luz.add(p, 'solElevacion', 2, 60, 0.5).name('sol: altura °').onChange(setSun);
  luz.add(p, 'solAcimut', 0, 360, 1).name('sol: acimut °').onChange(setSun);
  luz.add(p, 'solIntensidad', 0, 8, 0.05).name('sol: intensidad').onChange((v: number) => { t.dawn.sun.intensity = v; });
  luz.addColor(p, 'solColor').name('sol: color').onChange((v: string) => t.dawn.sun.color.set(v));
  luz.add(p, 'hemiIntensidad', 0, 2, 0.02).name('cielo (relleno)').onChange((v: number) => { t.dawn.hemi.intensity = v; });
  luz.add(p, 'entorno', 0, 2, 0.02).name('reflejos entorno').onChange((v: number) => { t.scene.environmentIntensity = v; });

  const amb = gui.addFolder('Niebla');
  amb.add(p, 'nieblaDensidad', 0, 0.02, 0.0002).name('densidad').onChange((v: number) => { fog.density = v; });
  amb.addColor(p, 'nieblaColor').name('color').onChange((v: string) => fog.color.set(v));

  if (fx) {
    const pp = gui.addFolder('Postprocesado');
    pp.add(p, 'saturacion', -0.5, 1, 0.01).onChange((v: number) => { fx.hue.saturation = v; });
    pp.add(p, 'contraste', -0.5, 0.6, 0.01).onChange((v: number) => { fx.contrast.contrast = v; });
    pp.add(p, 'brillo', -0.3, 0.3, 0.01).onChange((v: number) => { fx.contrast.brightness = v; });
    pp.add(p, 'bloomIntensidad', 0, 2, 0.01).name('bloom').onChange((v: number) => { fx.bloom.intensity = v; });
    pp.add(p, 'bloomUmbral', 0.3, 2, 0.01).name('bloom: umbral').onChange((v: number) => { fx.bloom.luminanceMaterial.threshold = v; });
    pp.add(p, 'contornos', 0, 1, 0.01).name('contornos').onChange((v: number) => { fx.ink.uniforms.get('strength')!.value = v; });
    pp.add(p, 'vinetaOscuridad', 0, 1, 0.01).name('viñeta').onChange((v: number) => { fx.vignette.darkness = v; });
    pp.add(p, 'vinetaRadio', 0, 1, 0.01).name('viñeta: radio').onChange((v: number) => { fx.vignette.offset = v; });
  }

  const ag = gui.addFolder('Agua');
  ag.add(p, 'caustica', 0, 1.5, 0.01).name('cáusticas').onChange((v: number) => { caus.value = v; });
  ag.addColor(p, 'aguaSomera').name('color somero').onChange((v: string) => sets((u) => (u.uShallow.value as THREE.Color).set(v)));
  ag.addColor(p, 'aguaProfunda').name('color profundo').onChange((v: string) => sets((u) => (u.uDeep.value as THREE.Color).set(v)));

  const acciones = {
    copiar: () => {
      const out = JSON.stringify(p, (_k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v), 2);
      void navigator.clipboard?.writeText(out).catch(() => {});
      console.log('Valores del ajuste visual:\n' + out);
    },
    restablecer: () => {
      // setValue solo dispara onChange si el valor cambia, por eso no se asigna antes a `p`
      gui.controllersRecursive().forEach((c) => {
        const v = (initial as Record<string, unknown>)[c.property];
        if (v !== undefined) c.setValue(v);
      });
    },
  };
  gui.add(acciones, 'copiar').name('Copiar valores (JSON)');
  gui.add(acciones, 'restablecer').name('Restablecer');
}
