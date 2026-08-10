import { BUILD_STEPS, CAPABILITIES, SERVICE_OFFERS, type ServiceOffer } from './services.js';

interface HomeStore {
  contactEmail: string;
  contactPhone: string;
  logo: string;
  announcement: string;
  offers: ServiceOffer[];
  showcase: ShowcaseItem[];
}

export interface ShowcaseItem {
  title: string;
  description: string;
  url: string;
  isVideo: boolean;
  link: string;
}

// Admin-editable portfolio. Each line in the `showcase` content field:
//   Title | Description | https://image-or-video-url | https://optional-live-link
export function parseShowcase(value: unknown): ShowcaseItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (typeof line !== 'string' || !line.trim()) return [];
    const [title, description, media, link] = line.split('|').map((part) => part.trim());
    if (!title) return [];
    let url = '';
    if (media) {
      try {
        const parsed = new URL(media);
        if (parsed.protocol === 'https:') url = parsed.toString();
      } catch (_error) { /* ignore bad media urls */ }
    }
    let safeLink = '';
    if (link) {
      try {
        const parsed = new URL(link);
        if (parsed.protocol === 'https:') safeLink = parsed.toString();
      } catch (_error) { /* ignore bad links */ }
    }
    return [{
      title,
      description: description || '',
      url,
      isVideo: /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url),
      link: safeLink,
    }];
  });
}

const FALLBACK_STORE: HomeStore = {
  contactEmail: 'moshadow154@gmail.com',
  contactPhone: '',
  logo: 'SHADOW|GLB',
  announcement: '',
  offers: SERVICE_OFFERS,
  showcase: [],
};

// Admin-editable offers. Each line in the `services` content field:
//   Title | Price | Timeline | Description | Feature; Feature; Feature
// Anything missing falls back to the built-in SERVICE_OFFERS above.
export function parseOffers(value: unknown): ServiceOffer[] {
  if (!Array.isArray(value)) return SERVICE_OFFERS;
  const parsed = value.flatMap((line, index) => {
    if (typeof line !== 'string' || !line.trim()) return [];
    const [title, price, timeline, description, features] = line.split('|').map((part) => part.trim());
    if (!title) return [];
    const base = SERVICE_OFFERS[index] || SERVICE_OFFERS[0];
    return [{
      id: `offer-${index + 1}`,
      code: base?.code || `0${index + 1} / SERVICE`,
      title,
      audience: base?.audience || '',
      price: price || base?.price || '',
      timeline: timeline || base?.timeline || '',
      description: description || base?.description || '',
      features: features ? features.split(';').map((item) => item.trim()).filter(Boolean) : (base?.features || []),
      featured: index === 1,
    } as ServiceOffer];
  });
  return parsed.length ? parsed : SERVICE_OFFERS;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readStore(payload: unknown): HomeStore {
  const outer = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const source = outer.store && typeof outer.store === 'object' ? outer.store as Record<string, unknown> : outer;
  const content = source.content && typeof source.content === 'object' ? source.content as Record<string, unknown> : {};
  const email = typeof content.contactEmail === 'string' && content.contactEmail.includes('@')
    ? content.contactEmail
    : typeof source.contactEmail === 'string' && source.contactEmail.includes('@')
      ? source.contactEmail
      : FALLBACK_STORE.contactEmail;
  return {
    contactEmail: email,
    contactPhone: typeof content.contactPhone === 'string' ? content.contactPhone.trim() : '',
    logo: typeof content.logo === 'string' && content.logo.trim() ? content.logo.trim() : FALLBACK_STORE.logo,
    announcement: typeof content.announce === 'string' ? content.announce.trim() : '',
    offers: parseOffers(content.services),
    showcase: parseShowcase(content.showcase),
  };
}

function cleanLogo(value: string): [string, string] {
  const plain = value.replace(/<\/?span>/gi, '|').replace(/<[^>]+>/g, '').replace(/\|+/g, '|');
  const [lead = 'SHADOW', tail = 'GLB'] = plain.split('|');
  return [lead || 'SHADOW', tail || 'GLB'];
}

function inquiry(offer: ServiceOffer | null, store: HomeStore): { href: string; label: string; external: boolean } {
  const subject = offer ? `${offer.title} enquiry` : 'ShadowGLB build enquiry';
  const message = offer
    ? `Hi ShadowGLB, I am interested in the ${offer.title}. My business/project is:`
    : 'Hi ShadowGLB, I want to discuss a dashboard or e-commerce build. My business/project is:';
  const phone = store.contactPhone.replace(/\D/g, '');
  if (phone) {
    return {
      href: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      label: 'Contact on WhatsApp',
      external: true,
    };
  }
  return {
    href: `mailto:${store.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    label: 'Start by email',
    external: false,
  };
}

function inquiryLink(offer: ServiceOffer | null, store: HomeStore, className: string): string {
  const link = inquiry(offer, store);
  return `<a class="${className}" href="${escapeHtml(link.href)}"${link.external ? ' target="_blank" rel="noopener noreferrer"' : ''}><span>${escapeHtml(link.label)}</span><b aria-hidden="true">&nearr;</b></a>`;
}

function packageCard(offer: ServiceOffer, store: HomeStore, index: number): string {
  return `<article class="service-package reveal${offer.featured ? ' service-package--featured' : ''}" style="--delay:${index * 90}ms" id="${escapeHtml(offer.id)}">
    <div class="package-topline"><span>${escapeHtml(offer.code)}</span>${offer.featured ? '<b>Most complete</b>' : ''}</div>
    <div class="package-heading">
      <div><h3>${escapeHtml(offer.title)}</h3><p>${escapeHtml(offer.audience)}</p></div>
      <strong>${escapeHtml(offer.price)}</strong>
    </div>
    <p class="package-description">${escapeHtml(offer.description)}</p>
    <ul>${offer.features.map((feature) => `<li><i aria-hidden="true">&#10003;</i><span>${escapeHtml(feature)}</span></li>`).join('')}</ul>
    <small>${escapeHtml(offer.timeline)} &middot; Final quote confirmed after scope</small>
    ${inquiryLink(offer, store, 'service-cta service-cta--wide')}
  </article>`;
}

function template(store: HomeStore): string {
  const [logoLead, logoTail] = cleanLogo(store.logo);
  return `${store.announcement ? `<div class="service-announce" role="status"><span>${escapeHtml(store.announcement)}</span><button type="button" aria-label="Dismiss announcement">&times;</button></div>` : ''}
    <header class="service-nav">
      <a class="service-brand" href="/" aria-label="ShadowGLB services"><span>${escapeHtml(logoLead)}</span><b>${escapeHtml(logoTail)}</b></a>
      <nav aria-label="Primary navigation">
        <a class="is-active" href="/">Services</a>
        <a href="/store/">Operator Kits</a>
        <a href="/systems/">Systems &amp; Templates</a>
        <a href="/files/">The Files</a>
        <a href="/wall/">The Wall</a>
        <a href="/contact/">Contact</a>
      </nav>
      <button class="service-menu-button" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="service-mobile-menu"><span></span><span></span></button>
    </header>
    <div class="service-mobile-menu" id="service-mobile-menu" aria-hidden="true">
      <div><span>Navigation</span><button type="button" aria-label="Close navigation">&times;</button></div>
      <nav aria-label="Mobile navigation">
        <a href="/"><small>01</small><span>Services</span></a>
        <a href="/store/"><small>02</small><span>Operator Kits</span></a>
        <a href="/systems/"><small>03</small><span>Systems &amp; Templates</span></a>
        <a href="/files/"><small>04</small><span>The Files</span></a>
        <a href="/wall/"><small>05</small><span>The Wall</span></a>
        <a href="/contact/"><small>06</small><span>Contact</span></a>
      </nav>
      <p>SHADOWGLB // BUILD DIVISION</p>
    </div>
    <main id="main-content">
      <section class="service-hero">
        <div class="service-hero-grid" aria-hidden="true"></div>
        <div class="service-orbit" aria-hidden="true"><span></span><span></span><i>SG</i></div>
        <div class="service-hero-copy">
          <span class="service-kicker">[ 01 / DIGITAL BUILD DIVISION ]</span>
          <h1>Systems built<br>for the <em>next move.</em></h1>
          <p>AI dashboards and e-commerce stores for operators who need clarity, control, and conversion&mdash;not another unfinished template.</p>
          <div class="service-hero-actions">${inquiryLink(null, store, 'service-cta service-cta--primary')}<a class="service-cta service-cta--ghost" href="#packages"><span>View the builds</span><b aria-hidden="true">&darr;</b></a></div>
          <div class="service-proof"><span><b>02</b> core services</span><span><b>01</b> accountable builder</span><span><b>100%</b> responsive</span></div>
        </div>
      </section>

      <section class="service-section service-capabilities" aria-labelledby="capabilities-title">
        <div class="service-section-heading reveal"><span>[ 02 / CAPABILITIES ]</span><div><h2 id="capabilities-title">Built as an operation.<br>Not decoration.</h2><p>Every screen has a job. Every integration has a reason. The result is something your business can actually use.</p></div></div>
        <div class="capability-grid">${CAPABILITIES.map((item, index) => `<article class="capability-card reveal" style="--delay:${index * 60}ms"><span>${escapeHtml(item.code)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join('')}</div>
      </section>

      <section class="service-section service-packages" id="packages" aria-labelledby="packages-title">
        <div class="service-section-heading reveal"><span>[ 03 / WAYS TO BUILD ]</span><div><h2 id="packages-title">Two focused offers.<br>One clear outcome.</h2><p>Choose the build closest to the problem. Scope is confirmed before money changes hands, so there are no fake buy buttons or surprise extras.</p></div></div>
        <div class="package-grid">${store.offers.map((offer, index) => packageCard(offer, store, index)).join('')}</div>
      </section>

      ${store.showcase.length ? `<section class="service-section service-work" aria-labelledby="work-title">
        <div class="service-section-heading reveal"><span>[ 04 / SELECTED WORK ]</span><div><h2 id="work-title">Built and shipped.</h2><p>Real builds, live and running. Not mockups.</p></div><div class="rail-controls"><button type="button" data-work-move="-1" aria-label="Previous work">&larr;</button><button type="button" data-work-move="1" aria-label="Next work">&rarr;</button></div></div>
        <div class="work-rail">${store.showcase.map((item, index) => `<article class="work-card${index === 0 ? ' is-active' : ''}">
          <div class="work-media"><span class="work-index">FILE // ${String(index + 1).padStart(2, '0')}</span>${item.url ? (item.isVideo
            ? `<video src="${escapeHtml(item.url)}" muted loop autoplay playsinline preload="metadata"></video>`
            : `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}" loading="lazy">`) : `<b>${escapeHtml(item.title.slice(0, 2).toUpperCase())}</b>`}</div>
          <div class="work-body"><h3>${escapeHtml(item.title)}</h3>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">View live <b aria-hidden="true">&nearr;</b></a>` : ''}</div>
        </article>`).join('')}</div>
        ${store.showcase.length > 1 ? `<div class="work-dots">${store.showcase.map((_, index) => `<button type="button" class="${index === 0 ? 'is-active' : ''}" aria-label="Show work ${index + 1}"></button>`).join('')}</div>` : ''}
      </section>` : ''}

      <section class="service-section service-process" aria-labelledby="process-title">
        <div class="service-section-heading reveal"><span>[ 04 / PROCESS ]</span><div><h2 id="process-title">From brief to live.</h2><p>A direct process designed to keep momentum without gambling with existing accounts, data, or production systems.</p></div></div>
        <ol>${BUILD_STEPS.map(([number, title, copy], index) => `<li class="reveal" style="--delay:${index * 60}ms"><span>${number}</span><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div></li>`).join('')}</ol>
      </section>

      <section class="service-final reveal">
        <span>[ READY WHEN YOU ARE ]</span><h2>Bring the problem.<br>We build the system.</h2><p>Send the goal, the current setup, and one or two examples. You will get a clear scope and price before the build starts.</p>${inquiryLink(null, store, 'service-cta service-cta--primary')}
      </section>
    </main>
    <footer class="service-footer"><a href="/">SHADOW<span>GLB</span></a><nav><a href="/store/">Kits</a><a href="/systems/">Systems</a><a href="/wall/">Wall</a><a href="/contact/">Contact</a><a href="/admin/">Admin</a></nav><p>&copy; 2026 Shadow Global &middot; TCF Firm Ltd</p></footer>`;
}

function bindInteractions(): void {
  const menu = document.querySelector<HTMLElement>('.service-mobile-menu');
  const open = document.querySelector<HTMLButtonElement>('.service-menu-button');
  const close = menu?.querySelector<HTMLButtonElement>(':scope > div button');
  const setMenu = (visible: boolean): void => {
    menu?.classList.toggle('is-open', visible);
    menu?.setAttribute('aria-hidden', String(!visible));
    open?.setAttribute('aria-expanded', String(visible));
    document.body.classList.toggle('service-menu-open', visible);
    if (visible) close?.focus();
  };
  open?.addEventListener('click', () => setMenu(true));
  close?.addEventListener('click', () => setMenu(false));
  document.onkeydown = (event) => { if (event.key === 'Escape') setMenu(false); };
  document.querySelector<HTMLButtonElement>('.service-announce button')?.addEventListener('click', (event) => {
    (event.currentTarget as HTMLElement).closest('.service-announce')?.remove();
  });

  const rail = document.querySelector<HTMLElement>('.work-rail');
  if (rail) {
    const cards = Array.from(rail.querySelectorAll<HTMLElement>('.work-card'));
    const dots = document.querySelectorAll<HTMLButtonElement>('.work-dots button');
    let down = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;
    const sync = (): void => {
      if (!cards.length) return;
      const centre = rail.scrollLeft + rail.clientWidth / 2;
      let active = 0;
      let best = Number.POSITIVE_INFINITY;
      cards.forEach((card, index) => {
        const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - centre);
        if (distance < best) { best = distance; active = index; }
      });
      cards.forEach((card, index) => card.classList.toggle('is-active', index === active));
      dots.forEach((dot, index) => dot.classList.toggle('is-active', index === active));
    };
    rail.addEventListener('scroll', sync, { passive: true });
    rail.addEventListener('pointerdown', (event) => {
      down = true; moved = false; startX = event.clientX; startScroll = rail.scrollLeft;
      rail.classList.add('is-dragging');
      rail.setPointerCapture(event.pointerId);
    });
    rail.addEventListener('pointermove', (event) => {
      if (!down) return;
      const delta = event.clientX - startX;
      if (Math.abs(delta) > 5) moved = true;
      rail.scrollLeft = startScroll - delta;
    });
    const release = (): void => { down = false; rail.classList.remove('is-dragging'); };
    rail.addEventListener('pointerup', release);
    rail.addEventListener('pointercancel', release);
    rail.addEventListener('click', (event) => { if (moved) { event.preventDefault(); event.stopPropagation(); } }, true);
    document.querySelectorAll<HTMLButtonElement>('[data-work-move]').forEach((button) => button.addEventListener('click', () => {
      rail.scrollBy({ left: Number(button.dataset.workMove) * rail.clientWidth * 0.8, behavior: 'smooth' });
    }));
    dots.forEach((dot, index) => dot.addEventListener('click', () => {
      cards[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }));
    requestAnimationFrame(sync);
  }

  const reveal = document.querySelectorAll<HTMLElement>('.reveal');
  if (revealsDone) {
    // Content was already shown once this session; skip the entrance animation
    // so a background refresh never makes the page flash or re-animate.
    reveal.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal.forEach((item) => item.classList.add('is-visible'));
    revealsDone = true;
    return;
  }
  revealsDone = true;
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  }), { threshold: 0.08 });
  reveal.forEach((item) => observer.observe(item));
}

function paint(store: HomeStore): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;
  root.innerHTML = template(store);
  document.title = 'ShadowGLB - AI dashboards and e-commerce stores';
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', 'ShadowGLB builds AI dashboards and conversion-led e-commerce stores for modern operators and brands.');
  bindInteractions();
}

let revealsDone = false;
const CACHE_KEY = 'shadowglb_services_v1';

function readCache(): { payload: unknown; fingerprint: string } | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { payload?: unknown; fingerprint?: unknown };
    if (!parsed || typeof parsed.fingerprint !== 'string' || parsed.payload === undefined) return null;
    return { payload: parsed.payload, fingerprint: parsed.fingerprint };
  } catch (_error) {
    return null;
  }
}

export function renderHomePage(): void {
  // Paint from the last known content first so repeat visits are instant and
  // never show placeholder copy that swaps out a moment later.
  const cached = readCache();
  paint(cached ? readStore(cached.payload) : FALLBACK_STORE);
  void fetch('/api/store', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Store unavailable')))
    .then((payload: unknown) => {
      const fingerprint = JSON.stringify(payload);
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({ payload, fingerprint }));
      } catch (_error) { /* storage full or blocked; the page still works */ }
      // Only repaint when something actually changed — avoids a needless
      // re-render, flash, or losing the visitor's place in the work rail.
      if (cached && cached.fingerprint === fingerprint) return;
      paint(readStore(payload));
    })
    .catch(() => { /* The cached or email fallback keeps the page usable offline. */ });
}
