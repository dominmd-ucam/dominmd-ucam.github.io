// Genera el HTML de la versión clásica a partir de src/data/*.json. Se ejecuta en la compilación (y en dev),
// así el contenido está en el HTML estático: indexable, accesible y visible antes de que cargue ningún JavaScript.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TYPE_LABEL = { web: 'Web', bot: 'Bot', plugin: 'Plugin', cli: 'Consola', mobile: 'App móvil', device: 'Dispositivo' };
const TYPE_BLURB = { web: 'Probar el demo', bot: 'Hablar con el bot', plugin: 'Abrir el panel', cli: 'Abrir la terminal', mobile: 'Probar la app', device: 'Ver el dispositivo' };

export function renderHead(profile) {
  const title = `${profile.name} · ${profile.role}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    jobTitle: profile.role,
    url: profile.siteUrl,
    description: profile.description,
    sameAs: (profile.links ?? []).map((l) => l.url),
  };
  return {
    title,
    meta: `
  <meta name="description" content="${esc(profile.description)}" />
  <link rel="canonical" href="${esc(profile.siteUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(profile.description)}" />
  <meta property="og:url" content="${esc(profile.siteUrl)}" />
  <meta name="twitter:card" content="summary" />
  <script type="application/ld+json">${JSON.stringify(ld)}</script>`,
  };
}

const chip = (t) => `<li>${esc(t)}</li>`;

export function renderClassic(profile, projects) {
  const links = (profile.links ?? []).map((l) => `<a class="btn ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('');
  const mail = profile.email ? `<a class="btn" href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>` : '';
  return `
<div id="classic">
  <a class="skip" href="#contenido">Saltar al contenido</a>
  <header class="site-header">
    <a class="brandmark" href="#inicio" aria-label="${esc(profile.name)}, inicio"><b>${esc(profile.name)}</b></a>
    <nav aria-label="Principal">
      <ul>
        <li><a href="#sobre-mi">Sobre mí</a></li>
        <li><a href="#proyectos">Proyectos</a></li>
        <li><a href="#habilidades">Habilidades</a></li>
        <li><a href="#libro" data-needs-api hidden>Libro de visitas</a></li>
        <li><a href="#contacto">Contacto</a></li>
      </ul>
    </nav>
    <button class="btn small enter3d" type="button" data-enter3d>🏝️ Isla 3D</button>
  </header>

  <main id="contenido">
    <section class="hero" id="inicio" aria-labelledby="h-hero">
      <div class="hero-text">
        <p class="eyebrow">${esc(profile.role)}</p>
        <h1 id="h-hero">Hola, soy <span>${esc(profile.name)}</span></h1>
        <p class="lede">${esc(profile.headline)}</p>
        <div class="cta">
          <button class="btn big enter3d" type="button" data-enter3d>🏝️ Explorar la isla en 3D</button>
          <a class="btn big ghost" href="#proyectos">Ver proyectos</a>
        </div>
        <p class="gate-note" data-gate-note hidden></p>
      </div>
      <div class="hero-art" aria-hidden="true">
        <svg viewBox="0 0 240 200">
          <polygon points="10,150 230,150 200,190 40,190" fill="#f3d9a4"/><polygon points="40,190 200,190 120,172" fill="#e6c689"/>
          <polygon points="0,150 240,150 240,200 0,200" fill="#1fb5b0" opacity=".35"/>
          <polygon points="112,150 124,150 132,60 118,52" fill="#9b6b43"/><polygon points="118,52 132,60 129,80" fill="#7a5233"/>
          <polygon points="122,54 50,48 78,76" fill="#3aa65b"/><polygon points="122,54 78,76 98,96" fill="#2f8f4e"/>
          <polygon points="126,54 196,44 176,76" fill="#3aa65b"/><polygon points="126,54 176,76 160,96" fill="#2f8f4e"/>
          <polygon points="122,54 98,10 138,22" fill="#4fbd6d"/><polygon points="122,54 138,22 168,34" fill="#3aa65b"/>
          <circle cx="196" cy="34" r="16" fill="#ffc857"/>
        </svg>
      </div>
    </section>

    <section id="sobre-mi" aria-labelledby="h-about">
      <h2 id="h-about">Sobre mí</h2>
      <div class="about">
        <div>${(profile.about ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        <ul class="highlights">
          ${(profile.highlights ?? []).map((h) => `<li><strong>${esc(h.title)}</strong><span>${esc(h.text)}</span></li>`).join('')}
        </ul>
      </div>
    </section>

    <section id="proyectos" aria-labelledby="h-projects">
      <h2 id="h-projects">Proyectos</h2>
      <p class="section-lede">Cada proyecto tiene un demo simulado que puedes probar aquí mismo, sin salir de la página. Los proyectos privados se muestran con datos ficticios.</p>
      <div class="filters" role="group" aria-label="Filtrar por tipo">
        <button type="button" class="chip on" data-filter="all">Todos</button>
        ${[...new Set(projects.map((p) => p.type))].map((t) => `<button type="button" class="chip" data-filter="${esc(t)}">${esc(TYPE_LABEL[t] ?? t)}</button>`).join('')}
      </div>
      <div class="cards">
        ${projects.map((p) => `
        <article class="card" data-type="${esc(p.type)}">
          <span class="tag" data-type="${esc(p.type)}">${esc(TYPE_LABEL[p.type] ?? p.type)}</span>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.description)}</p>
          <ul class="chips" aria-label="Tecnologías">${(p.tech ?? []).map(chip).join('')}</ul>
          <div class="card-actions">
            <button class="btn" type="button" data-project="${esc(p.id)}">${esc(TYPE_BLURB[p.type] ?? 'Ver demo')}</button>
            ${p.repo ? `<a class="btn ghost" href="${esc(p.repo)}" target="_blank" rel="noopener">Código</a>` : '<span class="private">🔒 Repositorio privado</span>'}
          </div>
          ${p.credit ? `<p class="card-note">${esc(p.credit)}</p>` : ''}
        </article>`).join('')}
      </div>
    </section>

    <section id="habilidades" aria-labelledby="h-skills">
      <h2 id="h-skills">Habilidades</h2>
      <div class="skills">
        ${(profile.skills ?? []).map((g) => `<div><h3>${esc(g.group)}</h3><ul class="chips">${g.items.map(chip).join('')}</ul></div>`).join('')}
      </div>
    </section>

    <section id="libro" aria-labelledby="h-book" data-needs-api hidden>
      <h2 id="h-book">Libro de visitas</h2>
      <p class="section-lede">Deja unas palabras si te ha gustado la isla. Los mensajes aparecen cuando los apruebo.</p>
      <div data-guestbook></div>
    </section>

    <section id="contacto" aria-labelledby="h-contact">
      <h2 id="h-contact">Contacto</h2>
      <p class="section-lede">Puedes ver mi código y escribirme por aquí.</p>
      <div class="cta">${mail}${links}</div>
      <div class="contact-form" data-contact data-needs-api hidden></div>
    </section>
  </main>

  <footer class="site-footer">
    <p>© ${new Date().getFullYear()} ${esc(profile.name)} · Avatar y modelos: <a href="https://github.com/wass08/r3f-ultimate-character-configurator" target="_blank" rel="noopener">Wawa Sensei</a> · Más en <a href="https://github.com/dominmd-ucam/dominmd-ucam.github.io/blob/main/CREDITS.md" target="_blank" rel="noopener">créditos</a></p>
  </footer>
</div>`;
}
