import { h, t, Life, appWindow } from './kit';
import './obsidian-rag.css';

/**
 * Obsidian RAG: una bóveda de notas de ejemplo indexada en tu navegador. La búsqueda es real (TF-IDF + similitud coseno sobre fragmentos;
 * el proyecto usa embeddings locales y ChromaDB) y la respuesta se compone citando las notas encontradas, como haría el servidor MCP.
 */
interface Note { path: string; title: string; body: string }
const NOTES: Note[] = [
  { path: 'Proyectos/Clawdmeter.md', title: 'Clawdmeter', body: t('El Clawdmeter es una pantalla AMOLED con un ESP32-S3. Se conecta al PC por Bluetooth LE y muestra el uso de Claude Code, la hora y el tiempo. Para instalarlo en Windows basta con ejecutar el instalador y emparejar el dispositivo.', 'The Clawdmeter is an AMOLED display with an ESP32-S3. It connects to the PC over Bluetooth LE and shows Claude Code usage, the time and the weather. To install it on Windows you just run the installer and pair the device.') },
  { path: 'Proyectos/Ganadería.md', title: t('Ganadería', 'Livestock'), body: t('La aplicación de ganadería registra albaranes de entrada, ubica cada animal en una cuadra y guarda traslados y bajas con foto como evidencia. Calcula el stock y el peso por cuadra.', 'The livestock app records incoming delivery notes, places every animal in a pen and stores transfers and losses with a photo as evidence. It computes stock and weight per pen.') },
  { path: 'Reuniones/2026-10-28 Cliente gimnasio.md', title: t('Reunión gimnasio', 'Gym meeting'), body: t('El cliente del gimnasio quiere reservas de clases con aforo, planes de nutrición y un chatbot con IA. Acordamos usar la API de Gemini y entregar el MVP el 15 de diciembre. Presupuesto aprobado: 4.800 euros.', 'The gym client wants class bookings with capacity limits, nutrition plans and an AI chatbot. We agreed to use the Gemini API and deliver the MVP on 15 December. Approved budget: 4,800 euros.') },
  { path: 'Reuniones/2026-11-04 Restaurante.md', title: t('Reunión restaurante', 'Restaurant meeting'), body: t('El restaurante pide carta digital por QR, pantalla de cocina y vista de camareros sincronizadas. El problema actual son los pedidos que se pierden entre sala y cocina en hora punta.', 'The restaurant wants a QR digital menu, a kitchen display and a waiter view, all in sync. Their current problem is orders getting lost between the floor and the kitchen at peak time.') },
  { path: 'Apuntes/Docker.md', title: 'Docker', body: t('Comandos útiles: docker compose up -d levanta los servicios en segundo plano. docker logs -f sigue los registros. Para limpiar imágenes sin usar: docker image prune.', 'Useful commands: docker compose up -d starts services in the background. docker logs -f follows the logs. To clean unused images: docker image prune.') },
  { path: 'Apuntes/RAG.md', title: 'RAG', body: t('RAG significa generación aumentada por recuperación. Se trocean los documentos, se calculan embeddings y se guardan en una base vectorial como ChromaDB. Al preguntar, se recuperan los fragmentos más parecidos y se pasan al modelo como contexto.', 'RAG means retrieval-augmented generation. Documents are chunked, embeddings are computed and stored in a vector database such as ChromaDB. When you ask, the most similar chunks are retrieved and given to the model as context.') },
  { path: 'Apuntes/XPath.md', title: 'XPath', body: t('XPath selecciona nodos de un documento. //div[@class="p"] busca todos los div con esa clase. text() devuelve el texto y count() cuenta nodos.', 'XPath selects nodes in a document. //div[@class="p"] finds every div with that class. text() returns the text and count() counts nodes.') },
  { path: 'Personal/Viaje Japón.md', title: t('Viaje a Japón', 'Trip to Japan'), body: t('Vuelo a Tokio el 3 de abril. Hotel en Shinjuku cuatro noches, luego Kioto en tren bala. Presupuesto de comida: 40 euros al día. Pendiente: comprar el JR Pass.', 'Flight to Tokyo on 3 April. Hotel in Shinjuku for four nights, then Kyoto by bullet train. Food budget: 40 euros a day. To do: buy the JR Pass.') },
  { path: 'Personal/Recetas.md', title: t('Recetas', 'Recipes'), body: t('Arroz con verduras: sofreír pimiento y alcachofa, añadir el arroz y el caldo, 18 minutos a fuego medio. Gazpacho: tomate, pepino, pimiento, ajo, aceite y vinagre.', 'Vegetable rice: fry peppers and artichoke, add the rice and stock, 18 minutes on medium heat. Gazpacho: tomato, cucumber, pepper, garlic, oil and vinegar.') },
  { path: 'Facturas/2026-10 Hosting.pdf', title: t('Factura hosting (PDF)', 'Hosting invoice (PDF)'), body: t('Factura de octubre de 2026 del servidor VPS: 12,10 euros con IVA. Renovación automática el día 1 de cada mes.', 'October 2026 invoice for the VPS server: 12.10 euros including VAT. Auto-renews on the 1st of each month.') },
  { path: 'Facturas/Gastos 2026.xlsx', title: t('Gastos 2026 (Excel)', 'Expenses 2026 (Excel)'), body: t('Hoja de gastos: hosting 145 euros al año, dominio 12 euros, licencias de software 220 euros. Total de gastos del año: 377 euros.', 'Expenses sheet: hosting 145 euros a year, domain 12 euros, software licences 220 euros. Total expenses for the year: 377 euros.') },
];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const STOP = new Set(norm(t('el la los las un una de del al y o a en con por para que se es son como más lo le su sus ya qué cuál cuándo dónde cómo mi me tengo hay', 'the a an of to and or in on with for that is are as more it its my me i have what which when where how do does there')).split(' '));
const SYN: Record<string, string> = t('cuesta:presupuesto|coste:presupuesto|precio:presupuesto|dinero:presupuesto|euros:presupuesto|gasté:gastos|gasto:gastos|instalo:instalar|instalación:instalar|vectorial:embeddings|vectores:embeddings|vuelo:viaje|japón:tokio|cocina:pedidos|camarero:sala|chatbot:ia', 'cost:budget|price:budget|money:budget|euros:budget|spent:expenses|spend:expenses|install:installer|installation:installer|vector:embeddings|vectors:embeddings|flight:trip|japan:tokyo|kitchen:orders|waiter:floor|chatbot:ai').split('|').reduce((o, p) => { const [a, b] = p.split(':'); o[norm(a)] = norm(b); return o; }, {} as Record<string, string>);
const stem = (w: string) => w.length > 5 ? w.replace(/(aciones|acion|amente|mente|ciones|cion|es|s)$/, '') : w;
const tokens = (s: string) => norm(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => stem(SYN[w] ?? w));

interface Chunk { note: Note; text: string; vec: Map<string, number>; norm: number }
function index() {
  const chunks: { note: Note; text: string; toks: string[] }[] = [];
  for (const n of NOTES) for (const s of n.body.match(/[^.!?]+[.!?]?/g) ?? []) chunks.push({ note: n, text: s.trim(), toks: tokens(n.title + ' ' + s) });
  const df = new Map<string, number>();
  for (const c of chunks) for (const w of new Set(c.toks)) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + chunks.length / (df.get(w) ?? 0.5));
  const vec = (toks: string[]) => { const v = new Map<string, number>(); for (const w of toks) v.set(w, (v.get(w) ?? 0) + idf(w)); return v; };
  const len = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0)) || 1;
  const out: Chunk[] = chunks.map((c) => { const v = vec(c.toks); return { note: c.note, text: c.text, vec: v, norm: len(v) }; });
  return {
    chunks: out, search(q: string, k = 4) {
      const qv = vec(tokens(q)), qn = len(qv);
      return out.map((c) => { let dot = 0; for (const [w, x] of qv) dot += x * (c.vec.get(w) ?? 0); return { c, s: dot / (qn * c.norm) }; }).filter((r) => r.s > 0.04).sort((a, b) => b.s - a.s).slice(0, k);
    },
  };
}

export function mount(host: HTMLElement) {
  const life = new Life();
  const ix = index();
  const tree = h('nav.or-tree.gk-scroll');
  const folders = new Map<string, Note[]>();
  for (const n of NOTES) { const f = n.path.split('/')[0]; folders.set(f, [...(folders.get(f) ?? []), n]); }
  const noteView = h('div.or-note.gk-scroll', { hidden: true });
  for (const [f, ns] of folders) tree.append(h('details', { open: true }, h('summary', null, '📁 ' + f), ...ns.map((n) => h('button.or-file', { onclick: () => openNote(n) }, (n.path.endsWith('.md') ? '📝 ' : '📎 ') + n.path.split('/')[1]))));
  const log = h('div.or-log.gk-scroll', { 'aria-live': 'polite' });
  const q = h('input', { type: 'text', placeholder: t('Pregunta a tus notas…', 'Ask your notes…'), 'aria-label': t('Pregunta', 'Question') });
  const send = h('button.btn', { type: 'submit' }, t('Preguntar', 'Ask'));
  const sugg = h('div.or-sugg', null, ...[
    t('¿Cuánto cuesta el proyecto del gimnasio?', 'How much does the gym project cost?'), t('¿Cómo instalo el Clawdmeter en Windows?', 'How do I install the Clawdmeter on Windows?'),
    t('¿Cuánto gasté este año?', 'How much did I spend this year?'), t('¿Qué es una base vectorial?', 'What is a vector database?'), t('¿Cuándo vuelo a Japón?', 'When do I fly to Japan?'),
  ].map((s) => h('button', { onclick: () => { q.value = s; ask(); } }, s)));
  const form = h('form.or-ask', { onsubmit: (e: Event) => { e.preventDefault(); ask(); } }, q, send);
  const mode = h('div.or-mode', null, h('span.pill.ok', null, '● ' + t(`Índice listo: ${NOTES.length} documentos, ${ix.chunks.length} fragmentos`, `Index ready: ${NOTES.length} documents, ${ix.chunks.length} chunks`)), h('span.muted', null, 'MCP · obsidian-rag'));
  const main = h('section.or-main', null, mode, noteView, log, sugg, form);
  const tabs = h('div.or-tabs', null, h('button.on', { onclick: () => body.classList.remove('show-tree') }, 'Chat'), h('button', { onclick: () => body.classList.add('show-tree') }, t('Bóveda', 'Vault')));
  tabs.addEventListener('click', (e) => tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)));
  const body = h('div.gk-body.or', null, h('aside.or-side', null, h('div.or-vault', null, '◆ ' + t('MiBóveda', 'MyVault')), tree), main);
  host.append(appWindow('Obsidian RAG — ' + t('chatea con tus notas', 'chat with your notes'), h('div.or-wrap', null, tabs, body), 'dark or-app'));

  function openNote(n: Note) {
    body.classList.remove('show-tree');
    noteView.hidden = false;
    noteView.replaceChildren(h('button.or-x', { onclick: () => { noteView.hidden = true; }, 'aria-label': t('Cerrar nota', 'Close note') }, '✕'), h('h4', null, n.title), h('div.muted', null, n.path), h('p', null, n.body));
  }
  function bubble(cls: string, ...kids: (Node | string)[]) { const b = h(`div.or-msg.${cls}`, null, ...kids); log.append(b); log.scrollTop = log.scrollHeight; return b; }
  async function ask() {
    const text = q.value.trim(); if (!text) return;
    q.value = ''; send.disabled = true; noteView.hidden = true;
    bubble('me', text);
    const steps = h('ol.or-steps');
    const bot = bubble('bot', steps);
    const step = async (s: string, ms = 350) => { steps.append(h('li', null, s)); log.scrollTop = log.scrollHeight; await life.wait(ms); };
    await step(t('Embedding de la pregunta (modelo local)', 'Embedding the question (local model)'));
    const hits = ix.search(text);
    await step(t(`Búsqueda en ChromaDB: ${hits.length} fragmentos con similitud > 0,04`, `ChromaDB search: ${hits.length} chunks with similarity > 0.04`));
    if (!life.alive) return;
    if (!hits.length) {
      bot.append(h('p', null, t('No encuentro nada sobre eso en tus notas. Prueba con otras palabras o pregunta por algo que esté en la bóveda.', 'I can\'t find anything about that in your notes. Try other words or ask about something in the vault.')));
      send.disabled = false; return;
    }
    const src = h('div.or-src', null, ...hits.map((r) => h('button.or-chunk', { onclick: () => openNote(r.c.note), title: r.c.note.path },
      h('b', null, r.s.toFixed(2)), h('span', null, '[[' + r.c.note.title + ']] '), h('i', null, r.c.text.length > 90 ? r.c.text.slice(0, 88) + '…' : r.c.text))));
    bot.append(src);
    await step(t('Contexto enviado al modelo con las fuentes', 'Context sent to the model with sources'), 450);
    // respuesta extractiva: frases de la mejor nota, en orden, citando la fuente
    const best = hits[0].c.note;
    const fromBest = hits.filter((r) => r.c.note === best && r.s > hits[0].s * 0.45).map((r) => r.c.text);
    const others = [...new Set(hits.filter((r) => r.c.note !== best && r.s > hits[0].s * 0.6).map((r) => r.c.note.title))];
    const ans = h('p.or-ans');
    bot.append(ans);
    const full = fromBest.join(' ');
    for (let i = 0; i <= full.length; i += 3) { if (!life.alive) return; ans.textContent = full.slice(0, i); log.scrollTop = log.scrollHeight; await life.wait(12); }
    ans.append(' ', h('button.or-cite', { onclick: () => openNote(best) }, '[[' + best.title + ']]'), ...others.map((o) => h('span.muted', null, ' · ' + t('ver también ', 'see also ') + o)));
    send.disabled = false;
  }
  life.after(400, () => { q.value = t('¿Cuánto cuesta el proyecto del gimnasio?', 'How much does the gym project cost?'); void ask(); });
  return () => life.dispose();
}
