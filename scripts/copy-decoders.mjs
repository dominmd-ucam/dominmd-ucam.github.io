// Copia el decodificador Draco de three a public/ para que los modelos comprimidos funcionen en local y en Pages.
// (No se copia Basis/KTX2: ningún modelo lo usa; ver src/assets/loader.ts para reactivarlo.)
import { cpSync, mkdirSync, rmSync } from 'node:fs';
const src = 'node_modules/three/examples/jsm/libs';
rmSync('public/basis', { recursive: true, force: true }); // restos de versiones anteriores
mkdirSync('public/draco', { recursive: true });
cpSync(`${src}/draco/gltf`, 'public/draco', { recursive: true });
console.log('decoder → public/draco');
