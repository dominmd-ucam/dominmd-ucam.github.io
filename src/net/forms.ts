import { ApiError, getGuestbook, postContact, postGuestbook, rememberVisitorName, visitorName } from './api';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function field(label: string, input: HTMLInputElement | HTMLTextAreaElement) {
  const l = el('label', 'nf-field');
  l.append(el('span', '', label), input);
  return l;
}
const honeypot = () => {
  const i = el('input', 'nf-hp');
  i.type = 'text'; i.name = 'website'; i.tabIndex = -1; i.autocomplete = 'off'; i.setAttribute('aria-hidden', 'true');
  return i;
};

/** Libro de visitas: lista de mensajes aprobados y formulario para dejar uno. */
export function mountGuestbook(host: HTMLElement) {
  host.replaceChildren();
  const list = el('div', 'nf-list');
  list.setAttribute('aria-live', 'polite');
  const form = el('form', 'nf-form');
  const name = el('input'); name.type = 'text'; name.maxLength = 40; name.required = true; name.value = visitorName(); name.autocomplete = 'name';
  const msg = el('textarea'); msg.maxLength = 280; msg.rows = 3; msg.required = true;
  const count = el('small', 'nf-count', '0 / 280');
  msg.addEventListener('input', () => { count.textContent = `${msg.value.length} / 280`; });
  const hp = honeypot();
  const status = el('p', 'nf-status');
  status.setAttribute('role', 'status');
  const send = el('button', 'nf-send', 'Firmar el libro'); send.type = 'submit';
  form.append(field('Tu nombre', name), field('Tu mensaje', msg), count, hp, send, status);
  host.append(list, form);

  const load = async () => {
    list.replaceChildren(el('p', 'nf-note', 'Cargando mensajes…'));
    try {
      const entries = await getGuestbook();
      if (!entries.length) { list.replaceChildren(el('p', 'nf-note', 'Aún no hay mensajes. ¡Sé la primera persona en firmar!')); return; }
      list.replaceChildren(...entries.map((e) => {
        const c = el('article', 'nf-entry');
        c.append(el('b', '', e.name), el('time', '', new Date(e.createdAt).toLocaleDateString('es-ES')), el('p', '', e.message));
        return c;
      }));
    } catch (e) {
      list.replaceChildren(el('p', 'nf-note', e instanceof ApiError ? e.message : 'No se pudo cargar el libro de visitas.'));
    }
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    send.disabled = true; status.className = 'nf-status'; status.textContent = 'Enviando…';
    try {
      await postGuestbook({ name: name.value, message: msg.value, website: hp.value });
      rememberVisitorName(name.value);
      status.classList.add('ok'); status.textContent = '¡Gracias! Tu mensaje aparecerá en cuanto lo apruebe.';
      msg.value = ''; count.textContent = '0 / 280';
    } catch (e) {
      status.classList.add('err'); status.textContent = e instanceof Error ? e.message : 'No se pudo enviar.';
    } finally { send.disabled = false; }
  });
  void load();
}

/** Formulario de contacto privado (el mensaje llega solo al dueño de la web). */
export function mountContact(host: HTMLElement) {
  host.replaceChildren();
  const form = el('form', 'nf-form');
  const name = el('input'); name.type = 'text'; name.maxLength = 60; name.required = true; name.value = visitorName(); name.autocomplete = 'name';
  const email = el('input'); email.type = 'email'; email.maxLength = 120; email.autocomplete = 'email';
  const msg = el('textarea'); msg.maxLength = 2000; msg.rows = 5; msg.required = true; msg.minLength = 5;
  const hp = honeypot();
  const status = el('p', 'nf-status'); status.setAttribute('role', 'status');
  const send = el('button', 'nf-send', 'Enviar mensaje'); send.type = 'submit';
  form.append(field('Tu nombre', name), field('Tu correo (opcional, solo si quieres respuesta)', email), field('Mensaje', msg), hp, send, status);
  host.append(form);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    send.disabled = true; status.className = 'nf-status'; status.textContent = 'Enviando…';
    try {
      await postContact({ name: name.value, email: email.value, message: msg.value, website: hp.value });
      status.classList.add('ok'); status.textContent = '¡Mensaje enviado! Te responderé en cuanto pueda.';
      msg.value = '';
    } catch (e) {
      status.classList.add('err'); status.textContent = e instanceof Error ? e.message : 'No se pudo enviar.';
    } finally { send.disabled = false; }
  });
}
