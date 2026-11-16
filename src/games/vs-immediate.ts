import { h, t, Life, appWindow } from './kit';
import './vs-immediate.css';

/**
 * vs-immediate: un depurador detenido en un breakpoint con Ventana Inmediato de verdad (un intérprete de expresiones tipo C#:
 * propiedades, índices, aritmética, comparaciones, asignaciones y lambdas sencillas con Where/Select/Sum/Any/First) y un agente
 * que usa las mismas órdenes que el plugin para encontrar el fallo.
 */
type V = number | string | boolean | null | V[] | { [k: string]: V } | ((x: V) => V);
const CODE: [number, string][] = [
  [34, 'public decimal Calcular(Pedido pedido, double descuento)'], [35, '{'], [36, '    decimal total = 0m;'],
  [37, '    for (int i = 0; i < pedido.Lineas.Count; i++)'], [38, '    {'], [39, '        var linea = pedido.Lineas[i];'],
  [40, '        if (linea.Cantidad < 0)'], [41, '            throw new InvalidOperationException(' + t('"la cantidad no puede ser negativa"', '"quantity cannot be negative"') + ');'],
  [42, '        total += linea.Precio * linea.Cantidad;'], [43, '    }'], [44, '    return total * (decimal)(1 - descuento);'], [45, '}'],
];
const BP = 42;

/* ---------- intérprete ---------- */
function lex(s: string) {
  const out: string[] = []; const re = /\s*(=>|==|!=|<=|>=|&&|\|\||"(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?m?|[A-Za-z_][\w]*|[-+*/%<>=!.,()[\]])/y;
  let m: RegExpExecArray | null; re.lastIndex = 0;
  while (re.lastIndex < s.length && (m = re.exec(s))) out.push(m[1]);
  if (s.slice(re.lastIndex).trim()) throw new Error(t(`símbolo inesperado «${s.slice(re.lastIndex).trim()[0]}»`, `unexpected symbol '${s.slice(re.lastIndex).trim()[0]}'`));
  return out;
}
function evaluate(src: string, scope: Record<string, V>): V {
  const tk = lex(src); let p = 0;
  const peek = () => tk[p], eat = (x?: string) => { const v = tk[p++]; if (x && v !== x) throw new Error(t(`se esperaba «${x}»`, `expected '${x}'`)); return v; };
  const num = (v: V) => { if (typeof v !== 'number') throw new Error(t('operando no numérico', 'non-numeric operand')); return v; };
  type Ref = { get(): V; set?(v: V): void };
  function assign(): V {
    const start = p; const r = ternaryRef();
    if (peek() === '=' && r.set) { eat(); const v = assign(); r.set(v); return v; }
    p = start; return or();
  }
  const ternaryRef = (): Ref => { try { return postfix(); } catch { return { get: () => null }; } };
  function or(): V { let a = and(); while (peek() === '||') { eat(); const b = and(); a = Boolean(a) || Boolean(b); } return a; }
  function and(): V { let a = cmp(); while (peek() === '&&') { eat(); const b = cmp(); a = Boolean(a) && Boolean(b); } return a; }
  function cmp(): V {
    let a = add();
    while (['==', '!=', '<', '>', '<=', '>='].includes(peek())) {
      const o = eat(), b = add();
      a = o === '==' ? a === b : o === '!=' ? a !== b : o === '<' ? num(a) < num(b) : o === '>' ? num(a) > num(b) : o === '<=' ? num(a) <= num(b) : num(a) >= num(b);
    }
    return a;
  }
  function add(): V { let a = mul(); while (peek() === '+' || peek() === '-') { const o = eat(), b = mul(); a = o === '+' ? (typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : num(a) + num(b)) : num(a) - num(b); } return a; }
  function mul(): V { let a = unary(); while (['*', '/', '%'].includes(peek())) { const o = eat(), b = num(unary()); a = o === '*' ? num(a) * b : o === '/' ? (b === 0 ? (() => { throw new Error('DivideByZeroException'); })() : num(a) / b) : num(a) % b; } return a; }
  function unary(): V { if (peek() === '-') { eat(); return -num(unary()); } if (peek() === '!') { eat(); return !unary(); } return postfix().get(); }
  function primary(): Ref {
    const x = eat();
    if (x === undefined) throw new Error(t('expresión incompleta', 'incomplete expression'));
    if (x === '(') {
      // conversión (decimal)x / (int)x
      if (/^(decimal|double|int|float)$/.test(peek()) && tk[p + 1] === ')') { const ty = eat(); eat(')'); const v = num(unary()); return { get: () => ty === 'int' ? Math.trunc(v) : v }; }
      const v = assign(); eat(')'); return { get: () => v };
    }
    if (x.startsWith('"')) return { get: () => JSON.parse(x) };
    if (/^\d/.test(x)) return { get: () => parseFloat(x) };
    if (x === 'true' || x === 'false') return { get: () => x === 'true' };
    if (x === 'null') return { get: () => null };
    if (peek() === '=>') { // lambda x => expr
      eat(); const body = tk.slice(p); let depth = 0, end = p;
      for (; end < tk.length; end++) { const c = tk[end]; if (c === '(') depth++; else if (c === ')') { if (depth === 0) break; depth--; } else if (c === ',' && depth === 0) break; }
      const text = body.slice(0, end - p).join(' '); p = end;
      return { get: () => (arg: V) => evaluate(text, { ...scope, [x]: arg }) };
    }
    if (!(x in scope)) throw new Error(t(`el nombre «${x}» no existe en el contexto actual`, `the name '${x}' does not exist in the current context`));
    return { get: () => scope[x], set: (v) => { scope[x] = v; } };
  }
  function postfix(): Ref {
    let r = primary();
    for (;;) {
      if (peek() === '.') {
        eat(); const name = eat(); const obj = r.get();
        if (peek() === '(') {
          eat(); const args: V[] = []; while (peek() !== ')') { args.push(assign()); if (peek() === ',') eat(); } eat(')');
          const v = call(obj, name, args); r = { get: () => v };
        } else r = prop(obj, name);
      } else if (peek() === '[') {
        eat(); const i = num(assign()); eat(']'); const arr = r.get();
        if (!Array.isArray(arr)) throw new Error(t('no se puede indexar', 'cannot index'));
        if (i < 0 || i >= arr.length) throw new Error('ArgumentOutOfRangeException');
        r = { get: () => arr[i], set: (v) => { arr[i] = v; } };
      } else return r;
    }
  }
  function prop(obj: V, name: string): Ref {
    if (Array.isArray(obj) && name === 'Count') return { get: () => obj.length };
    if (typeof obj === 'string' && name === 'Length') return { get: () => obj.length };
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && name in obj) return { get: () => (obj as Record<string, V>)[name], set: (v) => { (obj as Record<string, V>)[name] = v; } };
    throw new Error(t(`'${typeName(obj)}' no contiene una definición para '${name}'`, `'${typeName(obj)}' does not contain a definition for '${name}'`));
  }
  function call(obj: V, name: string, a: V[]): V {
    const f = a[0] as (x: V) => V;
    if (Array.isArray(obj)) switch (name) {
      case 'Where': return obj.filter((x) => f(x)); case 'Select': return obj.map((x) => f(x));
      case 'Sum': return obj.reduce((s: number, x) => s + num(f ? f(x) : x), 0); case 'Any': return f ? obj.some((x) => f(x)) : obj.length > 0;
      case 'Count': return f ? obj.filter((x) => f(x)).length : obj.length;
      case 'First': { const r = f ? obj.find((x) => f(x)) : obj[0]; if (r === undefined) throw new Error(t('InvalidOperationException: la secuencia no contiene elementos', 'InvalidOperationException: sequence contains no elements')); return r; }
      case 'ToList': return obj;
    }
    if (typeof obj === 'string') switch (name) { case 'ToUpper': return obj.toUpperCase(); case 'ToLower': return obj.toLowerCase(); case 'Contains': return obj.includes(String(a[0])); }
    if (name === 'ToString') return show(obj, false);
    throw new Error(t(`'${typeName(obj)}' no contiene un método '${name}'`, `'${typeName(obj)}' does not contain a method '${name}'`));
  }
  const v = assign();
  if (p < tk.length) throw new Error(t(`sobra «${tk[p]}»`, `unexpected '${tk[p]}'`));
  return v;
}
function typeName(v: V): string {
  if (Array.isArray(v)) return 'List<LineaPedido>'; if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'decimal';
  if (typeof v === 'string') return 'string'; if (typeof v === 'boolean') return 'bool'; if (v === null) return 'null';
  if (typeof v === 'function') return 'Func<>'; return String((v as Record<string, V>).__type ?? 'object');
}
function show(v: V, withType = true): string {
  const tn = withType ? `  (${typeName(v)})` : '';
  if (typeof v === 'string') return JSON.stringify(v) + tn;
  if (typeof v === 'number') return (Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000)) + tn;
  if (Array.isArray(v)) return `Count = ${v.length}` + tn;
  if (v && typeof v === 'object') return '{ ' + Object.entries(v).filter(([k]) => k !== '__type').map(([k, x]) => `${k} = ${Array.isArray(x) ? `Count = ${x.length}` : x && typeof x === 'object' ? `{${(x as Record<string, V>).__type}}` : show(x as V, false)}`).join(', ') + ' }' + tn;
  return String(v) + tn;
}

export function mount(host: HTMLElement) {
  const life = new Life();
  const linea = (Producto: string, Precio: number, Cantidad: number) => ({ __type: 'LineaPedido', Producto, Precio, Cantidad });
  const pedido = { __type: 'Pedido', Id: 1042, Estado: t('Pendiente', 'Pending'), Cliente: { __type: 'Cliente', Nombre: 'Ana López', Vip: true }, Lineas: [linea(t('Teclado', 'Keyboard'), 49.9, 2), linea(t('Ratón', 'Mouse'), 19.5, 1), linea('Hub USB-C', 27.99, -1)] as V[] };
  const scope: Record<string, V> = { pedido, descuento: 0.15, total: 0, i: 0, linea: pedido.Lineas[0] };
  let line = BP, state: 'break' | 'exception' | 'done' = 'break';

  /* paneles */
  const code = h('div.vi-code.gk-scroll');
  const rows = new Map<number, HTMLElement>();
  for (const [n, s] of CODE) { const r = h('div.vi-line', null, h('span.vi-ln', null, String(n)), h('code', null, s)); if (n === BP) r.classList.add('bp'); rows.set(n, r); code.append(r); }
  const locals = h('table.vi-locals');
  const stack = h('ol.vi-stack', null, ...['Pedido.Calcular(Pedido pedido, double descuento)  Pedido.cs:LINE', 'Servicio.Procesar(Pedido p)  Servicio.cs:88', 'Program.Main()  Program.cs:12'].map((s) => h('li', null, s)));
  const imm = h('div.vi-imm.gk-scroll', { 'aria-live': 'polite' });
  const input = h('input.vi-in', { type: 'text', spellcheck: false, placeholder: t('Escribe una expresión y pulsa Intro (p. ej. pedido.Lineas.Count)', 'Type an expression and press Enter (e.g. pedido.Lineas.Count)'), 'aria-label': t('Ventana Inmediato', 'Immediate Window') });
  const statusBar = h('div.vi-statusbar');
  const btnStep = h('button.vi-tb', { title: 'F10' }, '⤼ ' + t('Paso', 'Step over'));
  const btnCont = h('button.vi-tb', { title: 'F5' }, '▶ ' + t('Continuar', 'Continue'));
  const btnReset = h('button.vi-tb', null, '⟲ ' + t('Reiniciar', 'Restart'));
  const agentLog = h('div.vi-agent-log.gk-scroll');
  const agentBtn = h('button.btn.sm.vi-agent-btn', null, '✦ ' + t('Pedir al agente que lo investigue', 'Ask the agent to investigate'));
  const tabs = h('div.vi-tabs');
  const panes = {
    code: h('section.vi-pane.vi-p-code', null, h('div.vi-ptitle', null, 'Pedido.cs'), code),
    imm: h('section.vi-pane.vi-p-imm', null, h('div.vi-ptitle', null, t('Inmediato', 'Immediate')), imm, h('form', { onsubmit: (e: Event) => { e.preventDefault(); runImm(input.value); input.value = ''; } }, input)),
    vars: h('section.vi-pane.vi-p-vars', null, h('div.vi-ptitle', null, t('Variables locales', 'Locals')), h('div.gk-scroll', null, locals), h('div.vi-ptitle', null, t('Pila de llamadas', 'Call stack')), stack),
    agent: h('section.vi-pane.vi-p-agent', null, h('div.vi-ptitle', null, t('Agente (Claude Code + vs-immediate)', 'Agent (Claude Code + vs-immediate)')), agentLog, agentBtn),
  };
  const grid = h('div.vi-grid', null, panes.code, panes.vars, panes.imm, panes.agent);
  for (const [k, label] of [['code', t('Código', 'Code')], ['imm', t('Inmediato', 'Immediate')], ['vars', t('Variables', 'Locals')], ['agent', t('Agente', 'Agent')]] as const)
    tabs.append(h('button', { 'data-k': k, onclick: () => { grid.dataset.show = k; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); } }, label));
  grid.dataset.show = 'code'; (tabs.firstChild as HTMLElement).classList.add('on');
  host.append(appWindow('Rider — Tienda.Api [Debug]', h('div.vi', null, h('div.vi-toolbar', null, btnCont, btnStep, btnReset, statusBar), tabs, grid), 'dark vi-app'));

  function print(cls: string, s: string) { imm.append(h(`div.${cls}`, null, s)); imm.scrollTop = imm.scrollHeight; }
  function render() {
    rows.forEach((r, n) => r.classList.toggle('cur', n === line && state !== 'done'));
    rows.get(line)?.scrollIntoView({ block: 'nearest' });
    rows.forEach((r, n) => r.classList.toggle('exc', state === 'exception' && n === 41));
    locals.replaceChildren(...['pedido', 'descuento', 'total', 'i', 'linea'].map((k) => h('tr', null, h('td', null, k), h('td', null, show(scope[k], false)), h('td.muted', null, typeName(scope[k])))));
    (stack.firstChild as HTMLElement).textContent = `Pedido.Calcular(Pedido pedido, double descuento)  Pedido.cs:${line}`;
    statusBar.textContent = state === 'exception' ? '⚠ InvalidOperationException' : state === 'done' ? t('✓ Terminado: devolvió ', '✓ Finished: returned ') + show(scope.result, false) : t(`⏸ Detenido en Pedido.cs:${line}`, `⏸ Paused at Pedido.cs:${line}`);
    statusBar.className = 'vi-statusbar ' + state;
    btnStep.disabled = btnCont.disabled = state !== 'break';
  }
  function step() {
    if (state !== 'break') return;
    const L = pedido.Lineas as Record<string, V>[];
    switch (line) {
      case 42: scope.total = (scope.total as number) + (scope.linea as Record<string, number>).Precio * (scope.linea as Record<string, number>).Cantidad; line = 37; scope.i = (scope.i as number) + 1; break;
      case 37: line = (scope.i as number) < L.length ? 39 : 44; break;
      case 39: scope.linea = L[scope.i as number]; line = 40; break;
      case 40: line = ((scope.linea as Record<string, number>).Cantidad < 0) ? 41 : 42; break;
      case 41: state = 'exception'; print('vi-err', t('Excepción: InvalidOperationException: la cantidad no puede ser negativa\n   en Pedido.Calcular() Pedido.cs:41', 'Exception: InvalidOperationException: quantity cannot be negative\n   at Pedido.Calcular() Pedido.cs:41')); break;
      case 44: scope.result = (scope.total as number) * (1 - (scope.descuento as number)); state = 'done'; break;
    }
    render();
  }
  function cont() { if (state !== 'break') return; do step(); while (state === 'break' && line !== BP); }
  function runImm(src: string, quiet = false): string {
    const s = src.trim(); if (!s) return '';
    if (!quiet) print('vi-q', '> ' + s);
    let out: string;
    try { out = show(evaluate(s, scope)); render(); } catch (e) { out = 'error CS0103: ' + (e as Error).message; if (!quiet) { print('vi-err', out); return out; } }
    if (!quiet) print('vi-a', out);
    return out;
  }
  btnStep.addEventListener('click', step);
  btnCont.addEventListener('click', cont);
  btnReset.addEventListener('click', () => { pedido.Lineas[2] = linea('Hub USB-C', 27.99, -1); Object.assign(scope, { total: 0, i: 0, linea: pedido.Lineas[0] }); line = BP; state = 'break'; imm.replaceChildren(); render(); });
  life.on<KeyboardEvent>(host, 'keydown', (e) => { if (e.key === 'F10') { e.preventDefault(); step(); } if (e.key === 'F5') { e.preventDefault(); cont(); } });

  /* agente: usa las órdenes del plugin sobre el mismo depurador */
  let agentRunning = false;
  agentBtn.addEventListener('click', async () => {
    if (agentRunning) return; agentRunning = true; agentBtn.disabled = true; agentLog.replaceChildren();
    const say = async (cls: string, s: string, ms = 500) => { agentLog.append(h(`div.${cls}`, null, s)); agentLog.scrollTop = agentLog.scrollHeight; await life.wait(ms); };
    const tool = async (cmd: string, fn: () => string) => { await say('vi-tool', '⏺ vs-immediate ' + cmd, 350); await say('vi-res', '  ⎿ ' + fn(), 650); };
    await say('vi-user', t('> El pedido 1042 revienta al calcular el total. ¿Por qué?', '> Order 1042 crashes when computing the total. Why?'), 700);
    await say('vi-think', t('Miro el estado del depurador.', 'Let me look at the debugger state.'));
    await tool('locals', () => `i = ${show(scope.i, false)}, total = ${show(scope.total, false)}, linea = ${show(scope.linea, false)}`);
    await tool('eval "pedido.Lineas.Count"', () => runImm('pedido.Lineas.Count', true));
    await tool('eval "pedido.Lineas.Where(l => l.Cantidad < 0).Count()"', () => runImm('pedido.Lineas.Where(l => l.Cantidad < 0).Count()', true));
    if (state === 'break') await tool('continue', () => { cont(); return state === 'exception' ? t('excepción en Pedido.cs:41', 'exception at Pedido.cs:41') : t(`detenido en Pedido.cs:${line}`, `paused at Pedido.cs:${line}`); });
    await tool('eval "linea.Producto + \\" x\\" + linea.Cantidad"', () => runImm('linea.Producto + " x" + linea.Cantidad', true));
    await say('vi-think', t('La tercera línea del pedido (Hub USB-C) tiene Cantidad = -1. Es una devolución que se guardó como línea normal, y Validar no la filtra antes de calcular. Propongo tratar las cantidades negativas como devoluciones en Servicio.Procesar y añadir una prueba con ese caso.', 'The third order line (USB-C hub) has Quantity = -1. It is a return saved as a normal line, and nothing filters it before the total is computed. I suggest handling negative quantities as returns in Servicio.Procesar and adding a test for that case.'), 200);
    await say('vi-tip', t('Prueba tú: Reiniciar y en Inmediato escribe  pedido.Lineas[2].Cantidad = 1  y luego Continuar.', 'Try it: Restart, type  pedido.Lineas[2].Cantidad = 1  in Immediate, then Continue.'), 0);
    agentRunning = false; agentBtn.disabled = false;
  });

  print('vi-a', t('Depurador detenido en un breakpoint. Prueba:  pedido.Lineas[0]   ·   pedido.Lineas.Sum(l => l.Precio * l.Cantidad)   ·   descuento * 100', 'Debugger paused at a breakpoint. Try:  pedido.Lineas[0]   ·   pedido.Lineas.Sum(l => l.Precio * l.Cantidad)   ·   descuento * 100'));
  render();
  return () => life.dispose();
}
