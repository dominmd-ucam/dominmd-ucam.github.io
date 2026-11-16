// Genera el HTML de la versión clásica a partir de src/data/*.json. Se ejecuta en la compilación (y en dev),
// así el contenido está en el HTML estático: indexable, accesible y visible antes de que cargue ningún JavaScript.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TYPE_LABEL = {
  es: { web: 'Web', bot: 'Bot', plugin: 'Plugin', cli: 'Consola', mobile: 'App móvil', device: 'Dispositivo' },
  en: { web: 'Web', bot: 'Bot', plugin: 'Plugin', cli: 'Console', mobile: 'Mobile app', device: 'Device' },
};
const TYPE_BLURB = {
  es: { web: 'Probar el demo', bot: 'Hablar con el bot', plugin: 'Abrir el panel', cli: 'Abrir la terminal', mobile: 'Probar la app', device: 'Ver el dispositivo' },
  en: { web: 'Try the demo', bot: 'Chat with the bot', plugin: 'Open the panel', cli: 'Open the terminal', mobile: 'Try the app', device: 'See the device' },
};

// páginas de cada idioma (relativas a siteUrl) e imagen de vista previa al compartir (public/og-image.jpg, 1200×630)
export const PAGES = { es: '', en: 'en.html' };
const OG_IMAGE = 'og-image.jpg';

export function renderHead(profile, lang = 'es') {
  const t = (es, en) => (lang === 'en' ? en : es);
  const title = `${profile.name} · ${profile.role}`;
  const url = profile.siteUrl + PAGES[lang];
  const img = profile.siteUrl + OG_IMAGE;
  const alt = t('La isla 3D del portfolio de ', 'The 3D island of the portfolio of ') + profile.name;
  const sameAs = [...(profile.links ?? []).map((l) => l.url), profile.linkedin].filter(Boolean);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    jobTitle: profile.role,
    url: profile.siteUrl,
    description: profile.description,
    image: img,
    sameAs,
    ...(profile.email ? { email: `mailto:${profile.email}` } : {}),
  };
  return {
    title,
    meta: `
  <meta name="description" content="${esc(profile.description)}" />
  <link rel="canonical" href="${esc(url)}" />
  <link rel="alternate" hreflang="es" href="${esc(profile.siteUrl + PAGES.es)}" />
  <link rel="alternate" hreflang="en" href="${esc(profile.siteUrl + PAGES.en)}" />
  <link rel="alternate" hreflang="x-default" href="${esc(profile.siteUrl + PAGES.es)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${esc(profile.name)} · Portfolio" />
  <meta property="og:locale" content="${t('es_ES', 'en_US')}" />
  <meta property="og:locale:alternate" content="${t('en_US', 'es_ES')}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(profile.description)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:image" content="${esc(img)}" />
  <meta property="og:image:secure_url" content="${esc(img)}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(alt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(profile.description)}" />
  <meta name="twitter:image" content="${esc(img)}" />
  <meta name="twitter:image:alt" content="${esc(alt)}" />
  <script type="application/ld+json">${JSON.stringify(ld)}</script>`,
  };
}

const chip = (t) => `<li>${esc(t)}</li>`;

export function renderClassic(profile, projects, lang = 'es') {
  const t = (es, en) => (lang === 'en' ? en : es);
  const TL = TYPE_LABEL[lang], TB = TYPE_BLURB[lang];
  // contacto: cada botón sale solo si su dato está relleno en src/data/profile.json (email, linkedin, cv)
  const ext = (href, label, cls = 'btn ghost') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`;
  const mail = profile.email ? `<a class="btn" href="mailto:${esc(profile.email)}" data-contact-email>✉️ ${esc(profile.email)}</a>` : '';
  const linkedin = profile.linkedin ? ext(profile.linkedin, 'LinkedIn') : '';
  const cv = profile.cv ? `<a class="btn ghost" href="${esc(profile.cv)}" download data-contact-cv>📄 ${t('Descargar CV (PDF)', 'Download CV (PDF)')}</a>` : '';
  const links = (profile.links ?? []).map((l) => ext(l.url, esc(l.label))).join('');
  const other = lang === 'en' ? 'es' : 'en';
  const langLink = `<a class="lang-switch" href="./${PAGES[other] || ''}" data-lang="${other}" hreflang="${other}" lang="${other}" aria-label="${t('Read in English', 'Leer en español')}">${other.toUpperCase()}</a>`;
  return `
<div id="classic">
  <a class="skip" href="#contenido">${t('Saltar al contenido', 'Skip to content')}</a>
  <header class="site-header">
    <a class="brandmark" href="#inicio" aria-label="${esc(profile.name)}, ${t('inicio', 'home')}"><b>${esc(profile.name)}</b></a>
    <nav aria-label="${t('Principal', 'Main')}">
      <ul>
        <li><a href="#sobre-mi">${t('Sobre mí', 'About')}</a></li>
        <li><a href="#proyectos">${t('Proyectos', 'Projects')}</a></li>
        <li><a href="#habilidades">${t('Habilidades', 'Skills')}</a></li>
        <li><a href="#libro" data-needs-api hidden>${t('Libro de visitas', 'Guestbook')}</a></li>
        <li><a href="#contacto">${t('Contacto', 'Contact')}</a></li>
      </ul>
    </nav>
    ${langLink}
    <button class="btn small enter3d" type="button" data-enter3d>🏝️ ${t('Isla 3D', '3D island')}</button>
  </header>

  <main id="contenido">
    <section class="hero" id="inicio" aria-labelledby="h-hero">
      <div class="hero-text">
        <p class="eyebrow">${esc(profile.role)}</p>
        <h1 id="h-hero">${t('Hola, soy', "Hi, I'm")} <span>${esc(profile.name)}</span></h1>
        <p class="lede">${esc(profile.headline)}</p>
        <div class="cta">
          <button class="btn big enter3d" type="button" data-enter3d>🏝️ ${t('Explorar la isla en 3D', 'Explore the 3D island')}</button>
          <a class="btn big ghost" href="#proyectos">${t('Ver proyectos', 'See projects')}</a>
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
      <h2 id="h-about">${t('Sobre mí', 'About me')}</h2>
      <div class="about">
        <div>${(profile.about ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        <ul class="highlights">
          ${(profile.highlights ?? []).map((h) => `<li><strong>${esc(h.title)}</strong><span>${esc(h.text)}</span></li>`).join('')}
        </ul>
      </div>
    </section>

    <section id="proyectos" aria-labelledby="h-projects">
      <h2 id="h-projects">${t('Proyectos', 'Projects')}</h2>
      <p class="section-lede">${t('Cada proyecto tiene un demo simulado que puedes probar aquí mismo, sin salir de la página. Los proyectos privados se muestran con datos ficticios.', 'Every project has a simulated demo you can try right here, without leaving the page. Private projects are shown with fictional data.')}</p>
      <div class="filters" role="group" aria-label="${t('Filtrar por tipo', 'Filter by type')}">
        <button type="button" class="chip on" data-filter="all">${t('Todos', 'All')}</button>
        ${[...new Set(projects.map((p) => p.type))].map((ty) => `<button type="button" class="chip" data-filter="${esc(ty)}">${esc(TL[ty] ?? ty)}</button>`).join('')}
      </div>
      <div class="cards">
        ${projects.map((p) => `
        <article class="card" data-type="${esc(p.type)}">
          <span class="tag" data-type="${esc(p.type)}">${esc(TL[p.type] ?? p.type)}</span>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.description)}</p>
          <ul class="chips" aria-label="${t('Tecnologías', 'Technologies')}">${(p.tech ?? []).map(chip).join('')}</ul>
          <div class="card-actions">
            <button class="btn" type="button" data-project="${esc(p.id)}">${esc(TB[p.type] ?? t('Ver demo', 'See demo'))}</button>
            ${p.repo ? `<a class="btn ghost" href="${esc(p.repo)}" target="_blank" rel="noopener">${t('Código', 'Code')}</a>` : `<span class="private">🔒 ${t('Repositorio privado', 'Private repository')}</span>`}
          </div>
          ${p.credit ? `<p class="card-note">${esc(p.credit)}</p>` : ''}
        </article>`).join('')}
      </div>
    </section>

    <section id="habilidades" aria-labelledby="h-skills">
      <h2 id="h-skills">${t('Habilidades', 'Skills')}</h2>
      <div class="skills">
        ${(profile.skills ?? []).map((g) => `<div><h3>${esc(g.group)}</h3><ul class="chips">${g.items.map(chip).join('')}</ul></div>`).join('')}
      </div>
    </section>

    <section id="libro" aria-labelledby="h-book" data-needs-api hidden>
      <h2 id="h-book">${t('Libro de visitas', 'Guestbook')}</h2>
      <p class="section-lede">${t('Deja unas palabras si te ha gustado la isla. Los mensajes aparecen cuando los apruebo.', 'Leave a few words if you enjoyed the island. Messages show up once I approve them.')}</p>
      <div data-guestbook></div>
    </section>

    <section id="contacto" aria-labelledby="h-contact">
      <h2 id="h-contact">${t('Contacto', 'Contact')}</h2>
      <p class="section-lede">${profile.email || profile.linkedin ? t('¿Hablamos? Escríbeme o mira mi código.', "Let's talk: write to me or check out my code.") : t('Puedes ver mi código y escribirme por aquí.', 'You can see my code and reach me here.')}</p>
      <div class="cta contact-links">${mail}${linkedin}${cv}${links}</div>
      <div class="contact-form" data-contact data-needs-api hidden></div>
    </section>
  </main>

  <footer class="site-footer">
    <p>© ${new Date().getFullYear()} ${esc(profile.name)} · ${t('Avatar y modelos', 'Avatar and models')}: <a href="https://github.com/wass08/r3f-ultimate-character-configurator" target="_blank" rel="noopener">Wawa Sensei</a> · ${t('Más en', 'More in')} <a href="https://github.com/dominmd-ucam/dominmd-ucam.github.io/blob/main/CREDITS.md" target="_blank" rel="noopener">${t('créditos', 'credits')}</a></p>
  </footer>
</div>`;
}
