import { h, t, Life, phone, toast, fmt } from './kit';
import './hosteleria.css';

/**
 * Hostelería: la carta por QR de una mesa, la pantalla de cocina, la sala de camareros y el backoffice comparten el mismo estado.
 * Pides desde el móvil, el pedido aparece en cocina con su cronómetro, al marcarlo listo avisa a sala y el backoffice suma la venta.
 */
interface Dish { id: string; name: string; price: number; cat: string; emoji: string; mins: number }
interface Line { dish: Dish; qty: number; done: boolean }
interface Order { id: number; table: number; lines: Line[]; at: number; state: 'kitchen' | 'ready' | 'served'; note: string }
const MENU: Dish[] = [
  { id: 'brav', name: t('Patatas bravas', 'Patatas bravas'), price: 5.5, cat: t('Para picar', 'Starters'), emoji: '🥔', mins: 6 },
  { id: 'croq', name: t('Croquetas de jamón (6)', 'Ham croquettes (6)'), price: 7.9, cat: t('Para picar', 'Starters'), emoji: '🧆', mins: 7 },
  { id: 'ensa', name: t('Ensalada murciana', 'Murcian salad'), price: 8.5, cat: t('Para picar', 'Starters'), emoji: '🥗', mins: 4 },
  { id: 'arro', name: t('Arroz con verduras', 'Vegetable rice'), price: 14, cat: t('Principales', 'Mains'), emoji: '🥘', mins: 18 },
  { id: 'burg', name: t('Hamburguesa de la casa', 'House burger'), price: 12.5, cat: t('Principales', 'Mains'), emoji: '🍔', mins: 12 },
  { id: 'pulp', name: t('Pulpo a la brasa', 'Grilled octopus'), price: 18, cat: t('Principales', 'Mains'), emoji: '🐙', mins: 14 },
  { id: 'tart', name: t('Tarta de queso', 'Cheesecake'), price: 5.5, cat: t('Postres', 'Desserts'), emoji: '🍰', mins: 2 },
  { id: 'cana', name: t('Caña', 'Small beer'), price: 2.2, cat: t('Bebidas', 'Drinks'), emoji: '🍺', mins: 1 },
  { id: 'agua', name: t('Agua 50 cl', 'Water 50 cl'), price: 1.8, cat: t('Bebidas', 'Drinks'), emoji: '💧', mins: 1 },
];

export function mount(host: HTMLElement) {
  const life = new Life();
  const orders: Order[] = [];
  let nextId = 101, cart: Line[] = [], table = 4, rush = true;
  const sales: { total: number; items: Map<string, number>; tickets: number } = { total: 0, items: new Map(), tickets: 0 };
  const badge: Record<string, number> = { kitchen: 0, floor: 0, office: 0 };

  /* móvil del cliente */
  const menuList = h('div.ho-menu.gk-scroll');
  const cartBar = h('button.ho-cartbar', { hidden: true, onclick: () => send() });
  const tableSel = h('select.ho-table', { 'aria-label': t('Mesa', 'Table'), onchange: () => { table = Number(tableSel.value); } }, ...[2, 4, 5, 7, 9].map((n) => h('option', { value: String(n), selected: n === 4 }, t(`Mesa ${n}`, `Table ${n}`))));
  const cust = phone(h('div.ho-cust', null, h('div.ho-brand', null, h('b', null, 'La Terraza'), tableSel), menuList, cartBar), 'ho-phone');
  /* paneles de staff */
  const tabs = h('div.ho-tabs');
  const panels: Record<string, HTMLElement> = { kitchen: h('div.ho-p.ho-kds.gk-scroll'), floor: h('div.ho-p.ho-floor.gk-scroll'), office: h('div.ho-p.ho-office.gk-scroll') };
  const labels: Record<string, string> = { cust: '📱 ' + t('Carta QR', 'QR menu'), kitchen: '👨‍🍳 ' + t('Cocina', 'Kitchen'), floor: '🧑‍💼 ' + t('Sala', 'Floor'), office: '📊 Backoffice' };
  const rushBtn = h('label.ho-rush', null, h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => { rush = (e.target as HTMLInputElement).checked; } }), t('Otras mesas piden solas', 'Other tables order too'));
  const staff = h('div.ho-staff', null, tabs, ...Object.values(panels), rushBtn);
  const body = h('div.gk-body.ho', null, cust, staff);
  const wrap = h('div.gk.ho-root', null, body);
  host.append(wrap);
  let cur = 'kitchen';
  function show(k: string) {
    cur = k; body.dataset.show = k;
    if (k in badge) badge[k] = 0;
    Object.entries(panels).forEach(([n, p]) => { p.hidden = n !== k; });
    renderTabs(); render();
  }
  function renderTabs() {
    tabs.replaceChildren(...['cust', 'kitchen', 'floor', 'office'].map((k) => h(`button.${k === 'cust' ? 'ho-only-m' : 'x'}${cur === k ? '.on' : ''}`, { onclick: () => show(k) }, labels[k], badge[k] ? h('i', null, String(badge[k])) : '')));
  }

  function renderMenu() {
    const cats = [...new Set(MENU.map((d) => d.cat))];
    menuList.replaceChildren(...cats.flatMap((c) => [h('h5', null, c), ...MENU.filter((d) => d.cat === c).map((d) => {
      const q = cart.find((l) => l.dish === d)?.qty ?? 0;
      return h('div.ho-dish', null, h('span.ho-em', null, d.emoji), h('div', null, h('b', null, d.name), h('small', null, fmt(d.price, 2) + ' €')),
        q ? h('div.ho-qty', null, h('button', { onclick: () => add(d, -1), 'aria-label': '−' }, '−'), h('b', null, String(q)), h('button', { onclick: () => add(d, 1), 'aria-label': '+' }, '+')) : h('button.ho-add', { onclick: () => add(d, 1) }, t('Añadir', 'Add')));
    })]));
    const n = cart.reduce((s, l) => s + l.qty, 0), tot = cart.reduce((s, l) => s + l.qty * l.dish.price, 0);
    cartBar.hidden = !n;
    cartBar.textContent = t(`Enviar pedido · ${n} · ${fmt(tot, 2)} €`, `Send order · ${n} · ${fmt(tot, 2)} €`);
  }
  function add(d: Dish, k: number) {
    const l = cart.find((x) => x.dish === d);
    if (l) { l.qty += k; if (l.qty <= 0) cart = cart.filter((x) => x !== l); } else cart.push({ dish: d, qty: 1, done: false });
    renderMenu();
  }
  function place(tb: number, lines: Line[], note = '') {
    const o: Order = { id: nextId++, table: tb, lines, at: Date.now(), state: 'kitchen', note };
    orders.push(o);
    if (cur !== 'kitchen') badge.kitchen++;
    renderTabs(); render();
    return o;
  }
  function send() {
    if (!cart.length) return;
    place(table, cart.map((l) => ({ ...l })));
    cart = []; renderMenu();
    toast(wrap, t('Pedido enviado a cocina', 'Order sent to the kitchen'), life, 'ok');
    if (innerWidth < 700) show('kitchen');
  }
  const mmss = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function render() {
    if (cur === 'kitchen') {
      const live = orders.filter((o) => o.state === 'kitchen');
      panels.kitchen.replaceChildren(...(live.length ? live.map((o) => {
        const age = Date.now() - o.at, late = age > 90_000;
        return h(`article.ho-ticket${late ? '.late' : ''}`, null,
          h('div.ho-th', null, h('b', null, t(`Mesa ${o.table}`, `Table ${o.table}`)), h('span', null, `#${o.id}`), h('span.ho-timer', null, mmss(age))),
          h('ul', null, ...o.lines.map((l) => h(`li${l.done ? '.done' : ''}`, { onclick: () => { l.done = !l.done; render(); } }, h('b', null, `${l.qty}×`), ' ', l.dish.name))),
          o.note && h('div.ho-note', null, o.note),
          h('button.btn.sm', { onclick: () => { o.state = 'ready'; o.lines.forEach((l) => { l.done = true; }); badge.floor++; renderTabs(); render(); toast(wrap, t(`Mesa ${o.table}: listo para servir`, `Table ${o.table}: ready to serve`), life, 'info'); } }, t('Listo ✓', 'Ready ✓')));
      }) : [h('p.ho-empty', null, t('Sin comandas. Pide algo desde la carta QR.', 'No tickets. Order something from the QR menu.'))]));
    } else if (cur === 'floor') {
      const tables = [2, 4, 5, 7, 9];
      panels.floor.replaceChildren(h('div.ho-tables', null, ...tables.map((tb) => {
        const os = orders.filter((o) => o.table === tb && o.state !== 'served');
        const ready = os.filter((o) => o.state === 'ready');
        const st = ready.length ? 'ready' : os.length ? 'wait' : orders.some((o) => o.table === tb) ? 'eat' : 'free';
        return h(`div.ho-tb.${st}`, null, h('b', null, String(tb)), h('small', null, { ready: t('¡Recoger!', 'Pick up!'), wait: t('En cocina', 'In kitchen'), eat: t('Comiendo', 'Eating'), free: t('Libre', 'Free') }[st]),
          ready.length ? h('button.btn.sm', { onclick: () => serve(ready) }, t('Entregado', 'Served')) : '');
      })), h('p.muted', null, t('Verde: hay platos listos para llevar. Ámbar: esperando a cocina.', 'Green: dishes ready to take out. Amber: waiting on the kitchen.')));
    } else if (cur === 'office') {
      const top = [...sales.items.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), max = top[0]?.[1] ?? 1;
      const waits = orders.filter((o) => o.state !== 'kitchen');
      panels.office.replaceChildren(
        h('div.ho-kpis', null, ...[[t('Ventas de hoy', 'Sales today'), fmt(sales.total, 2) + ' €'], [t('Tickets', 'Tickets'), String(sales.tickets)], [t('Ticket medio', 'Avg. ticket'), fmt(sales.total / Math.max(1, sales.tickets), 2) + ' €'], [t('En cocina', 'In kitchen'), String(orders.filter((o) => o.state === 'kitchen').length)]].map(([l, v]) => h('div', null, h('b', null, v), h('span', null, l)))),
        h('h5', null, t('Platos más vendidos', 'Best sellers')),
        h('div.ho-top', null, ...(top.length ? top.map(([n, q]) => h('div', null, h('span', null, n), h('div', null, h('i', { style: `width:${(q / max) * 100}%` })), h('b', null, String(q)))) : [h('p.muted', null, t('Aún no hay ventas: sirve algún pedido.', 'No sales yet: serve an order.'))])),
        h('p.muted', null, t(`Pedidos atendidos: ${waits.length}. Todo se actualiza en tiempo real desde las otras pantallas.`, `Orders handled: ${waits.length}. Everything updates live from the other screens.`)));
    }
  }
  function serve(os: Order[]) {
    for (const o of os) {
      o.state = 'served'; sales.tickets++;
      for (const l of o.lines) { sales.total += l.qty * l.dish.price; sales.items.set(l.dish.name, (sales.items.get(l.dish.name) ?? 0) + l.qty); }
    }
    if (cur !== 'office') badge.office++;
    renderTabs(); render();
  }
  // otras mesas piden solas y la cocina "trabaja" sola si nadie la toca
  life.every(14000, () => {
    if (!rush) return;
    const tb = [2, 5, 7, 9][Math.floor(Math.random() * 4)];
    const lines = MENU.filter(() => Math.random() < .28).slice(0, 3).map((d) => ({ dish: d, qty: 1 + Math.floor(Math.random() * 2), done: false }));
    if (lines.length) place(tb, lines, Math.random() < .3 ? t('Sin gluten', 'Gluten free') : '');
  });
  life.every(1000, () => { if (cur === 'kitchen') panels.kitchen.querySelectorAll('.ho-timer').forEach((el, i) => { const o = orders.filter((x) => x.state === 'kitchen')[i]; if (o) el.textContent = mmss(Date.now() - o.at); }); });
  place(7, [{ dish: MENU[1], qty: 1, done: true }, { dish: MENU[4], qty: 2, done: false }, { dish: MENU[7], qty: 2, done: false }]).at -= 52_000;
  place(2, [{ dish: MENU[3], qty: 1, done: false }, { dish: MENU[8], qty: 2, done: false }], t('Mesa con niños', 'Table with kids')).at -= 20_000;
  badge.kitchen = 0;
  renderMenu(); show('kitchen');
  return () => life.dispose();
}
