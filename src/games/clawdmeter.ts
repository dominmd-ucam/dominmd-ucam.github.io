import { h, t, Life, appWindow, toast } from './kit';
import './clawdmeter.css';

/**
 * Clawdmeter: la pantalla AMOLED con ESP32-S3 y su programa para Windows. Instalas el puente, lo emparejas por Bluetooth LE
 * y la pantalla empieza a recibir datos: uso de la sesión y de la semana, hora real, servicios y la mascota en pixel art.
 */
const W = 320, H = 170;
const MASCOT = [ // mascota original en pixel art (12×10): 1 cuerpo, 2 ojo, 3 mejilla, 4 patas
  '...111111...', '..11111111..', '.1121111211.', '.1111111111.', '.1311111131.', '111111111111', '.1111111111.', '.1111111111.', '..4.4..4.4..', '..4.4..4.4..',
];

export function mount(host: HTMLElement) {
  const life = new Life();
  let step = 0, paired = false, screen = 0, auto = true, session = 37, week = 22, working = false, bright = 1;
  const resetAt = Date.now() + (2 * 3600 + 10 * 60) * 1000;
  const cv = h('canvas.cm-screen', { width: W * 2, height: H * 2 });
  const g = cv.getContext('2d')!; g.scale(2, 2);
  const btn = h('button.cm-btn', { 'aria-label': t('Botón del dispositivo: siguiente pantalla', 'Device button: next screen'), onclick: () => { screen = (screen + 1) % 4; auto = false; autoBox.checked = false; } });
  const autoBox = h('input', { type: 'checkbox', checked: true, onchange: () => { auto = autoBox.checked; } });
  const brightIn = h('input', { type: 'range', min: '20', max: '100', value: '100', 'aria-label': t('Brillo', 'Brightness'), oninput: () => { bright = Number(brightIn.value) / 100; } });
  const device = h('div.cm-dev-wrap', null, h('div.cm-dev', null, h('div.cm-bezel', null, cv), btn, h('span.cm-led')),
    h('div.cm-dctl', null, h('label', null, autoBox, t('Rotar pantallas', 'Cycle screens')), h('label', null, '☀', brightIn)), h('small.muted', null, t('Pulsa el botón del lateral para cambiar de pantalla', 'Press the side button to change screen')));
  const wiz = h('div.cm-wiz');
  const win = appWindow('Clawdmeter Bridge', wiz, 'cm-win');
  host.append(h('div.gk.cm-root', null, h('div.gk-body.cm', null, device, win)));

  function renderWiz() {
    const steps = [t('Instalar', 'Install'), t('Emparejar', 'Pair'), t('Listo', 'Ready')];
    const head = h('ol.cm-steps', null, ...steps.map((s, i) => h(`li${i < step ? '.done' : i === step ? '.on' : ''}`, null, s)));
    let content: HTMLElement;
    if (step === 0) {
      const bar = h('div.cm-bar', null, h('i'));
      const txt = h('small.muted', null, t('Instala el servicio que lee tu uso de Claude Code y lo envía a la pantalla.', 'Installs the service that reads your Claude Code usage and sends it to the display.'));
      const go = h('button.btn', { onclick: async () => {
        go.disabled = true;
        const parts = [t('Descargando ClawdmeterBridge.msi…', 'Downloading ClawdmeterBridge.msi…'), t('Instalando el servicio de Windows…', 'Installing the Windows service…'), t('Configurando el arranque automático…', 'Setting up auto-start…')];
        for (let k = 0; k < parts.length; k++) { txt.textContent = parts[k]; (bar.firstChild as HTMLElement).style.width = `${((k + 1) / parts.length) * 100}%`; await life.wait(900); }
        step = 1; renderWiz();
      } }, t('Instalar', 'Install'));
      content = h('div.cm-pane', null, h('h5', null, t('Instalación en un clic', 'One-click install')), txt, bar, go, h('small.muted', null, t('La versión original pedía compilar y flashear a mano: aquí el instalador lo hace todo.', 'The original version required building and flashing by hand: this installer does it all.')));
    } else if (step === 1) {
      const list = h('div.cm-scan', null, h('span.cm-spin'), t('Buscando dispositivos Bluetooth LE…', 'Scanning for Bluetooth LE devices…'));
      life.after(1300, () => {
        if (step !== 1) return;
        list.replaceChildren(...[['Clawdmeter-3F2A', -48, true], ['JBL Flip 5', -71, false], ['Mi Band 7', -80, false]].map(([n, rssi, ok]) => h('div.cm-devrow', null, h('span', null, ok ? '🖥' : '🔈'), h('b', null, String(n)), h('small.muted', null, `${rssi} dBm`),
          ok ? h('button.btn.sm', { onclick: async (e: Event) => { (e.target as HTMLButtonElement).disabled = true; (e.target as HTMLButtonElement).textContent = t('Conectando…', 'Connecting…'); await life.wait(1100); paired = true; step = 2; renderWiz(); toast(win, t('Conectado a Clawdmeter-3F2A', 'Connected to Clawdmeter-3F2A'), life, 'ok'); } }, t('Conectar', 'Connect')) : h('small.muted', null, t('no compatible', 'not compatible')))));
      });
      content = h('div.cm-pane', null, h('h5', null, t('Empareja la pantalla', 'Pair the display')), h('small.muted', null, t('Enciende el Clawdmeter: anuncia su servicio BLE al arrancar.', 'Turn on the Clawdmeter: it advertises its BLE service on boot.')), list);
    } else {
      const log = h('div.cm-log.gk-scroll');
      const work = h('button.btn', { onclick: () => { working = !working; work.textContent = working ? '⏸ ' + t('Parar la sesión', 'Stop the session') : '▶ ' + t('Simular una sesión con Claude Code', 'Simulate a Claude Code session'); work.classList.toggle('ghost', working); } }, '▶ ' + t('Simular una sesión con Claude Code', 'Simulate a Claude Code session'));
      content = h('div.cm-pane', null, h('h5', null, '● ' + t('Conectado · Clawdmeter-3F2A', 'Connected · Clawdmeter-3F2A')), work, h('small.muted', null, t('Paquetes enviados por BLE (GATT notify):', 'Packets sent over BLE (GATT notify):')), log,
        h('button.btn.ghost.sm', { onclick: () => { paired = false; step = 1; working = false; renderWiz(); } }, t('Desconectar', 'Disconnect')));
      logEl = log;
    }
    wiz.replaceChildren(head, content);
  }
  let logEl: HTMLElement | null = null;
  life.every(1500, () => {
    if (!paired) return;
    if (working) { session = Math.min(100, session + 1.6); week = Math.min(100, week + .4); }
    if (logEl && step === 2) {
      logEl.prepend(h('div', null, `→ ${new Date().toTimeString().slice(0, 8)} usage {"session":${session.toFixed(0)},"week":${week.toFixed(0)}}`));
      while (logEl.childElementCount > 30) logEl.lastChild!.remove();
    }
    if (session >= 90 && working) { working = false; toast(win, t('Aviso en la pantalla: sesión al 90 %', 'Display warning: session at 90%'), life, 'warn'); renderWiz(); }
  });

  /* pantalla */
  const C = { bg: '#000', fg: '#f4efe6', dim: '#8a857c', acc: '#e8875f', ok: '#4ade80', warn: '#fbbf24', bad: '#f87171' };
  function bar(x: number, y: number, w: number, v: number, label: string, note: string) {
    g.fillStyle = C.fg; g.font = '600 12px system-ui'; g.fillText(label, x, y);
    g.textAlign = 'right'; g.fillText(`${v.toFixed(0)} %`, x + w, y); g.textAlign = 'left';
    g.fillStyle = '#222'; g.beginPath(); g.roundRect(x, y + 6, w, 10, 5); g.fill();
    g.fillStyle = v > 85 ? C.bad : v > 60 ? C.warn : C.acc; g.beginPath(); g.roundRect(x, y + 6, Math.max(10, (w * v) / 100), 10, 5); g.fill();
    g.fillStyle = C.dim; g.font = '10px system-ui'; g.fillText(note, x, y + 30);
  }
  function draw(time: number) {
    g.globalAlpha = 1; g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.globalAlpha = bright;
    if (!paired) {
      g.fillStyle = C.dim; g.font = '600 13px system-ui'; g.textAlign = 'center';
      g.fillText(t('Esperando conexión BLE…', 'Waiting for BLE connection…'), W / 2, H / 2 + 26);
      g.fillStyle = Math.sin(time * 4) > 0 ? '#3b82f6' : '#1e3a8a'; g.font = '700 34px system-ui'; g.fillText('ᛒ', W / 2, H / 2 - 2); g.textAlign = 'left';
      return;
    }
    // indicador de pantalla
    for (let k = 0; k < 4; k++) { g.fillStyle = k === screen ? C.fg : '#333'; g.beginPath(); g.arc(W / 2 - 18 + k * 12, H - 8, 2.5, 0, 7); g.fill(); }
    if (screen === 0) {
      g.fillStyle = C.acc; g.font = '700 13px system-ui'; g.fillText('Claude Code', 16, 22);
      g.fillStyle = working ? C.ok : C.dim; g.beginPath(); g.arc(W - 20, 18, 4, 0, 7); g.fill();
      const left = Math.max(0, resetAt - Date.now()), hh = Math.floor(left / 3.6e6), mm = Math.floor((left % 3.6e6) / 6e4);
      bar(16, 50, W - 32, session, t('Sesión actual', 'Current session'), t(`se reinicia en ${hh} h ${mm} min`, `resets in ${hh} h ${mm} min`));
      bar(16, 108, W - 32, week, t('Semana', 'Week'), t('se reinicia el lunes', 'resets on Monday'));
    } else if (screen === 1) {
      const d = new Date();
      g.fillStyle = C.fg; g.font = '200 58px system-ui'; g.fillText(d.toTimeString().slice(0, 5), 16, 80);
      g.fillStyle = C.dim; g.font = '12px system-ui'; g.fillText(d.toLocaleDateString(document.documentElement.lang || 'es', { weekday: 'long', day: 'numeric', month: 'long' }), 18, 102);
      g.fillStyle = C.warn; g.beginPath(); g.arc(W - 52, 50, 16, 0, 7); g.fill();
      g.strokeStyle = C.warn; g.lineWidth = 2; for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4 + time * .3; g.beginPath(); g.moveTo(W - 52 + Math.cos(r) * 21, 50 + Math.sin(r) * 21); g.lineTo(W - 52 + Math.cos(r) * 27, 50 + Math.sin(r) * 27); g.stroke(); }
      g.fillStyle = C.fg; g.font = '600 20px system-ui'; g.textAlign = 'center'; g.fillText('24 °C', W - 52, 102); g.fillStyle = C.dim; g.font = '11px system-ui'; g.fillText('Murcia · ' + t('Soleado', 'Sunny'), W - 52, 118); g.textAlign = 'left';
    } else if (screen === 2) {
      g.fillStyle = C.acc; g.font = '700 13px system-ui'; g.fillText(t('Servicios', 'Services'), 16, 22);
      [['Claude API', C.ok, t('operativo', 'operational')], ['Claude Code', C.ok, t('operativo', 'operational')], ['GitHub', C.ok, t('operativo', 'operational')], [t('Copias de seguridad', 'Backups'), C.warn, t('retrasada 2 h', '2 h late')]].forEach(([n, c, s], k) => {
        g.fillStyle = c; g.beginPath(); g.arc(22, 46 + k * 26, 4.5, 0, 7); g.fill();
        g.fillStyle = C.fg; g.font = '13px system-ui'; g.fillText(n, 34, 51 + k * 26); g.fillStyle = C.dim; g.font = '11px system-ui'; g.textAlign = 'right'; g.fillText(s, W - 16, 51 + k * 26); g.textAlign = 'left';
      });
    } else {
      const px = 7, ox = 26, bob = Math.round(Math.sin(time * 3) * 2), blink = (time % 3.2) < .15;
      MASCOT.forEach((row, y) => [...row].forEach((c, x) => {
        if (c === '.') return;
        let col = c === '1' ? C.acc : c === '2' ? (blink ? C.acc : '#111') : c === '3' ? '#f6a58a' : '#b65a37';
        if (c === '4') { const step2 = Math.floor(time * 4) % 2; if ((x % 4 === 2) === !!step2 && y === 9) return; col = '#b65a37'; }
        g.fillStyle = col; g.fillRect(ox + x * px, 34 + y * px + (c === '4' ? 0 : bob), px, px);
      }));
      g.fillStyle = C.fg; g.font = '600 13px system-ui';
      const line = session > 85 ? t('¡Para un poco! Sesión casi llena.', 'Take a break! Session almost full.') : working ? t('Programando a tope 💪', 'Coding at full speed 💪') : t('¡Buen trabajo hoy!', 'Great work today!');
      const words = line.split(' '); let ln = '', yy = 62;
      for (const w of words) { if (g.measureText(ln + w).width > 140) { g.fillText(ln, 150, yy); ln = ''; yy += 17; } ln += w + ' '; }
      g.fillText(ln, 150, yy);
    }
  }
  let acc = 0;
  life.loop((dt, time) => { acc += dt; if (auto && paired && acc > 5) { acc = 0; screen = (screen + 1) % 4; } draw(time); });
  renderWiz();
  return () => life.dispose();
}
