// Optimiza los .glb de assets-src/ → public/models/ (malla Meshopt, texturas WebP, instancias y simplificación segura).
// Uso: npm run models:optimize        (para calidad alta en tu servidor: npm run models:optimize -- --hq)
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const hq = process.argv.includes('--hq');
const out = hq ? 'assets-hq' : 'public/models';
mkdirSync(out, { recursive: true });
const files = readdirSync('assets-src').filter((f) => f.endsWith('.glb'));
if (!files.length) console.log('No hay .glb en assets-src/');
for (const f of files) {
  const args = ['-y', '@gltf-transform/cli', 'optimize', `assets-src/${f}`, `${out}/${f}`, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', hq ? '4096' : '1024'];
  console.log('→', f);
  const r = spawnSync('npx', args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
