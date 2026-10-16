// Copia los decodificadores Draco y Basis (KTX2) de three a public/ para que los modelos comprimidos funcionen en local y en Pages.
import { cpSync, mkdirSync } from 'node:fs';
const src = 'node_modules/three/examples/jsm/libs';
mkdirSync('public/draco', { recursive: true });
mkdirSync('public/basis', { recursive: true });
cpSync(`${src}/draco/gltf`, 'public/draco', { recursive: true });
cpSync(`${src}/basis`, 'public/basis', { recursive: true });
console.log('decoders → public/draco, public/basis');
