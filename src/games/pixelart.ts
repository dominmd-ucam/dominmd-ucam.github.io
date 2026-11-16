import { h, t, Life, browser, toast } from './kit';
import './pixelart.css';

/** Convertidor a pixel art de verdad: tu propia imagen o una de muestra, tamaño de píxel, paletas, tramado y descarga en PNG. */
const PALETTES: Record<string, string[] | null> = {
  [t('Colores originales', 'Original colours')]: null,
  'PICO-8 (16)': ['000000', '1d2b53', '7e2553', '008751', 'ab5236', '5f574f', 'c2c3c7', 'fff1e8', 'ff004d', 'ffa300', 'ffec27', '00e436', '29adff', '83769c', 'ff77a8', 'ffccaa'],
  'Game Boy (4)': ['0f380f', '306230', '8bac0f', '9bbc0f'],
  [t('Blanco y negro (2)', 'Black & white (2)')]: ['000000', 'ffffff'],
  'Sweetie (16)': ['1a1c2c', '5d275d', 'b13e53', 'ef7d57', 'ffcd75', 'a7f070', '38b764', '257179', '29366f', '3b5dc9', '41a6f6', '73eff7', 'f4f4f4', '94b0c2', '566c86', '333c57'],
};
const rgb = (hx: string) => [parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)];

function sample(kind: number, W = 480, H = 300) {
  const c = h('canvas', { width: W, height: H }); const g = c.getContext('2d')!;
  if (kind === 0) { // atardecer en la playa
    const sky = g.createLinearGradient(0, 0, 0, H * .62); sky.addColorStop(0, '#3b5dc9'); sky.addColorStop(.6, '#ef7d57'); sky.addColorStop(1, '#ffcd75');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(W * .7, H * .5, 40, 0, 7); g.fill();
    const sea = g.createLinearGradient(0, H * .6, 0, H); sea.addColorStop(0, '#29a3c9'); sea.addColorStop(1, '#0d4f6b');
    g.fillStyle = sea; g.fillRect(0, H * .6, W, H * .4);
    g.fillStyle = 'rgba(255,240,200,.6)'; for (let i = 0; i < 14; i++) g.fillRect(W * .58 + Math.sin(i) * 30, H * .63 + i * 7, 60 - i * 3, 2);
    g.fillStyle = '#f3d9a4'; g.beginPath(); g.ellipse(W * .22, H * .98, W * .4, 60, 0, 0, 7); g.fill();
    g.strokeStyle = '#5b3a1e'; g.lineWidth = 10; g.beginPath(); g.moveTo(W * .2, H); g.quadraticCurveTo(W * .17, H * .6, W * .25, H * .35); g.stroke();
    g.fillStyle = '#2f8f46'; for (let a = 0; a < 7; a++) { g.save(); g.translate(W * .25, H * .35); g.rotate(a * .9); g.beginPath(); g.ellipse(45, 0, 48, 10, 0, 0, 7); g.fill(); g.restore(); }
  } else { // gato
    g.fillStyle = '#a7d8f0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7cc08a'; g.fillRect(0, H * .75, W, H * .25);
    g.fillStyle = '#f2a65a'; g.beginPath(); g.ellipse(W / 2, H * .62, 95, 80, 0, 0, 7); g.fill();
    g.beginPath(); g.arc(W / 2, H * .36, 70, 0, 7); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + s * 62, H * .3); g.lineTo(W / 2 + s * 52, H * .08); g.lineTo(W / 2 + s * 20, H * .2); g.fill(); }
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(W / 2, H * .44, 34, 22, 0, 0, 7); g.fill();
    g.fillStyle = '#222'; for (const s of [-1, 1]) { g.beginPath(); g.arc(W / 2 + s * 26, H * .33, 8, 0, 7); g.fill(); }
    g.fillStyle = '#e46f8a'; g.beginPath(); g.arc(W / 2, H * .41, 6, 0, 7); g.fill();
    g.strokeStyle = '#c56e2e'; g.lineWidth = 6; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W / 2, H * .6 + i * 18, 60, 3.6, 5.8); g.stroke(); }
  }
  return c;
}

export function mount(host: HTMLElement) {
  const life = new Life();
  let src: HTMLCanvasElement | HTMLImageElement = sample(0);
  const out = h('canvas.px-out');
  const before = h('canvas.px-before');
  const size = h('input', { type: 'range', min: '2', max: '32', value: '8', 'aria-label': t('Tamaño de píxel', 'Pixel size') });
  const sizeV = h('b', null, '8');
  const pal = h('select', { 'aria-label': t('Paleta', 'Palette') }, ...Object.keys(PALETTES).map((k) => h('option', null, k)));
  const dither = h('input', { type: 'checkbox' });
  const grid = h('input', { type: 'checkbox' });
  const split = h('input', { type: 'range', min: '0', max: '100', value: '50', 'aria-label': t('Comparar', 'Compare') });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const stats = h('span.muted.px-stats');
  const stage = h('div.px-stage', null, before, out, h('div.px-handle', { 'aria-hidden': 'true' }));
  const controls = h('div.px-ctrl', null,
    h('div.px-src', null, h('button.btn.sm', { onclick: () => file.click() }, '📁 ' + t('Tu imagen', 'Your image')),
      h('button.btn.ghost.sm', { onclick: () => { src = sample(0); draw(); } }, t('Playa', 'Beach')),
      h('button.btn.ghost.sm', { onclick: () => { src = sample(1); draw(); } }, t('Gato', 'Cat')), file),
    h('label', null, t('Tamaño de píxel', 'Pixel size'), size, sizeV),
    h('label', null, t('Paleta', 'Palette'), pal),
    h('label.px-check', null, dither, t('Tramado Floyd–Steinberg', 'Floyd–Steinberg dithering')),
    h('label.px-check', null, grid, t('Rejilla', 'Grid')),
    h('label', null, t('Antes / después', 'Before / after'), split),
    h('div.px-src', null, h('button.btn', { onclick: download }, '⬇ ' + t('Descargar PNG', 'Download PNG')), stats));
  const { root } = browser('dominmd-ucam.github.io/Convertidor-Imagenes-a-Pixelart', t('Convertidor a pixel art', 'Pixel art converter'), h('div.gk-body.px', null, stage, controls));
  host.append(root);

  file.addEventListener('change', () => {
    const f = file.files?.[0]; if (!f) return;
    const img = new Image();
    img.onload = () => { src = img; draw(); toast(root, t('Imagen cargada: se procesa en tu navegador, no se sube a ningún sitio', 'Image loaded: processed in your browser, never uploaded'), life, 'ok'); };
    img.src = URL.createObjectURL(f);
  });
  for (const i of [size, pal, dither, grid]) i.addEventListener('input', draw);
  split.addEventListener('input', clip);
  // arrastrar sobre la imagen mueve la comparación
  let dragging = false;
  const move = (e: PointerEvent) => { if (!dragging) return; const r = stage.getBoundingClientRect(); split.value = String(Math.round(((e.clientX - r.left) / r.width) * 100)); clip(); };
  stage.addEventListener('pointerdown', (e) => { dragging = true; stage.setPointerCapture(e.pointerId); move(e); });
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', () => { dragging = false; });

  function clip() { stage.style.setProperty('--split', split.value + '%'); }
  function draw() {
    const px = Number(size.value); sizeV.textContent = String(px);
    const sw0 = 'naturalWidth' in src ? src.naturalWidth : src.width, sh0 = 'naturalHeight' in src ? src.naturalHeight : src.height;
    const k = Math.min(1, 640 / Math.max(sw0, sh0)), W = Math.round(sw0 * k), H = Math.round(sh0 * k);
    for (const c of [out, before]) { c.width = W; c.height = H; }
    before.getContext('2d')!.drawImage(src, 0, 0, W, H);
    const sw = Math.max(1, Math.round(W / px)), sh = Math.max(1, Math.round(H / px));
    const tiny = h('canvas', { width: sw, height: sh }); const tg = tiny.getContext('2d')!;
    tg.drawImage(src, 0, 0, sw, sh);
    const data = tg.getImageData(0, 0, sw, sh), d = data.data;
    const palette = PALETTES[pal.value]?.map(rgb) ?? null;
    const used = new Set<number>();
    if (palette) {
      const err = new Float32Array(sw * sh * 3);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const i = y * sw + x, o = i * 4;
        const r = d[o] + err[i * 3], g = d[o + 1] + err[i * 3 + 1], b = d[o + 2] + err[i * 3 + 2];
        let best = 0, bd = Infinity;
        palette.forEach((p, j) => { const dd = (r - p[0]) ** 2 * .3 + (g - p[1]) ** 2 * .59 + (b - p[2]) ** 2 * .11; if (dd < bd) { bd = dd; best = j; } });
        const p = palette[best]; used.add(best);
        d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2];
        if (dither.checked) {
          const er = [r - p[0], g - p[1], b - p[2]];
          for (const [dx, dy, w] of [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]) {
            const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= sw || ny >= sh) continue;
            const ni = (ny * sw + nx) * 3; err[ni] += er[0] * w; err[ni + 1] += er[1] * w; err[ni + 2] += er[2] * w;
          }
        }
      }
      tg.putImageData(data, 0, 0);
    } else for (let o = 0; o < d.length; o += 4) used.add((d[o] >> 3) << 10 | (d[o + 1] >> 3) << 5 | d[o + 2] >> 3);
    const g = out.getContext('2d')!;
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
    g.drawImage(tiny, 0, 0, sw, sh, 0, 0, W, H);
    if (grid.checked && px >= 4) {
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x <= sw; x++) { const X = Math.round(x * W / sw) + .5; g.moveTo(X, 0); g.lineTo(X, H); }
      for (let y = 0; y <= sh; y++) { const Y = Math.round(y * H / sh) + .5; g.moveTo(0, Y); g.lineTo(W, Y); }
      g.stroke();
    }
    stage.style.aspectRatio = `${W} / ${H}`;
    stats.textContent = `${sw}×${sh} px · ${used.size} ${t('colores', 'colours')}`;
    clip();
  }
  function download() {
    const a = h('a', { href: out.toDataURL('image/png'), download: 'pixelart.png' }); a.click();
    toast(root, t('PNG descargado', 'PNG downloaded'), life, 'ok');
  }
  draw();
  return () => life.dispose();
}
