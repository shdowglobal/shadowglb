import { renderAdmin } from './admin.js';
import type { MediaItem, Product, PublicRoute, PublicStore, WallItem } from './types.js';

const app = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('#app');

const DEFAULT_CONTACT = 'moshadow154@gmail.com';
const SYSTEM_TYPES = new Set(['system', 'template']);

export function routeFromPath(pathname: string): PublicRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'home';
  if (path === '/systems') return 'systems';
  if (path === '/wall') return 'wall';
  if (path === '/admin') return 'admin';
  if (path === '/checkout/success') return 'success';
  if (/^\/products\/[^/]+$/.test(path)) return 'product';
  return 'not-found';
}
a
export function isSystemsProduct(product: Product): boolean {
  return SYSTEM_TYPES.has(String(product.ptype || '').toLowerCase());
}

export function formatMoney(value: string | number): string {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function normalizeGallery(value: unknown): WallItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      return [{ id: `wall-${index + 1}`, url: item.trim(), alt: `ShadowGLB visual ${index + 1}` }];
    }
    if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'string' && item.url.trim()) {
      const record = item as { id?: unknown; url: string; alt?: unknown };
      return [{
        id: typeof record.id === 'string' ? record.id : `wall-${index + 1}`,
        url: record.url.trim(),
        alt: typeof record.alt === 'string' && record.alt.trim() ? record.alt.trim() : `ShadowGLB visual ${index + 1}`,
      }];
    }
    return [];
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cleanLogo(value: string | undefined): string {
  const plain = String(value || 'SHADOW|GLB')
    .replace(/<\/?span>/gi, '|')
    .replace(/<[^>]+>/g, '')
    .replace(/\|+/g, '|');
  return plain || 'SHADOW|GLB';
}

function mediaFor(product: Product): MediaItem[] {
  const media = Array.isArray(product.media)
    ? product.media.filter((item) => item && typeof item.url === 'string' && item.url.trim())
    : [];
  if (!media.length && product.imageUrl) media.push({ url: product.imageUrl, type: 'image', alt: product.name });
  return media;
}

function productPath(product: Product): string {
  return `/products/${encodeURIComponent(String(product.id))}/`;
}

function normalizeStore(payload: unknown): PublicStore {
  const outer = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const source = outer.store && typeof outer.store === 'object' ? outer.store as Record<string, unknown> : outer;
  const products = Array.isArray(source.products)
    ? source.products.filter((item): item is Product => Boolean(item && typeof item === 'object' && 'id' in item && 'name' in item))
    : [];
  const content = source.content && typeof source.content === 'object' ? source.content as PublicStore['content'] : {};
  return {
    products: products.filter((product) => product.active !== false),
    gallery: normalizeGallery(source.gallery),
    content,
    contactEmail: typeof source.contactEmail === 'string' && source.contactEmail.includes('@')
      ? source.contactEmail
      : DEFAULT_CONTACT,
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...rest } = init || {};
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...rest,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...initHeaders },
  });
  const data = await response.json().catch(() => ({})) as T & {
    error?: string | { message?: string };
  };
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : data.error?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return data;
}

function activeClass(target: PublicRoute, current: PublicRoute): string {
  return target === current ? ' is-active' : '';
}

function chrome(route: PublicRoute, content: string, store?: PublicStore): string {
  const contact = escapeHtml(store?.contactEmail || DEFAULT_CONTACT);
  const announcement = store?.content.announce?.trim();
  const logo = cleanLogo(store?.content.logo);
  const [logoLead = 'SHADOW', logoTail = 'GLB'] = logo.split('|');
  return `
    ${announcement ? `<div class="announce" role="status"><span>${escapeHtml(announcement)}</span><button class="announce-close" type="button" aria-label="Dismiss announcement">×</button></div>` : ''}
    <header class="topbar">
      <a class="brand" href="/" aria-label="ShadowGLB store"><span>${escapeHtml(logoLead)}</span><b>${escapeHtml(logoTail)}</b></a>
      <nav class="desktop-nav" aria-label="Primary navigation">
        <a class="nav-link${activeClass('home', route)}" href="/">Store</a>
        <a class="nav-link${activeClass('systems', route)}" href="/systems/">Systems &amp; Templates</a>
        <a class="nav-link${activeClass('wall', route)}" href="/wall/">The Wall</a>
        <a class="nav-link" href="mailto:${contact}">Contact</a>
      </nav>
      <div class="topbar-actions">
        <span class="status-pill"><i></i>${escapeHtml(store?.content.pill || 'The Vault')}</span>
        <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="mobile-menu"><span></span><span></span></button>
      </div>
    </header>
    <div class="mobile-menu" id="mobile-menu" aria-hidden="true">
      <div class="mobile-menu-head"><span>Navigation</span><button class="menu-close" type="button" aria-label="Close navigation">×</button></div>
      <nav aria-label="Mobile navigation">
        <a href="/"><small>01</small><span>Store</span></a>
        <a href="/systems/"><small>02</small><span>Systems &amp; Templates</span></a>
        <a href="/wall/"><small>03</small><span>The Wall</span></a>
        <a href="mailto:${contact}"><small>04</small><span>Contact</span></a>
      </nav>
      <p>SHADOWGLB // MMXXVI</p>
    </div>
    <main id="main-content" tabindex="-1">${content}</main>
    <footer class="site-footer">
      <a class="footer-brand" href="/">SHADOW<span>GLB</span></a>
      <div class="footer-links"><a href="mailto:${contact}">Contact</a><a href="/admin/">Admin</a></div>
      <p>${escapeHtml(store?.content.fcopy || '© 2026 Shadow Global · TCF Firm Ltd')}</p>
    </footer>
    <div class="toast-region" aria-live="polite" aria-atomic="true"></div>`;
}

function bindChrome(): void {
  const menu = document.querySelector<HTMLElement>('.mobile-menu');
  const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
  const close = document.querySelector<HTMLButtonElement>('.menu-close');
  const announce = document.querySelector<HTMLElement>('.announce');
  const setMenu = (open: boolean): void => {
    menu?.classList.toggle('is-open', open);
    menu?.setAttribute('aria-hidden', String(!open));
    toggle?.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    if (open) close?.focus(); else if (document.activeElement === close) toggle?.focus();
  };
  toggle?.addEventListener('click', () => setMenu(true));
  close?.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu?.classList.contains('is-open')) setMenu(false);
  });
  document.querySelector<HTMLButtonElement>('.announce-close')?.addEventListener('click', () => {
    announce?.remove();
    document.body.classList.remove('has-announce');
  });
  document.body.classList.toggle('has-announce', Boolean(announce));
}

function setMeta(title: string, description: string): void {
  document.title = title;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', description);
}

function showToast(message: string, tone: 'success' | 'error' = 'success'): void {
  const region = document.querySelector<HTMLElement>('.toast-region');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${tone}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function loadingShell(route: PublicRoute): string {
  const skeletons = Array.from({ length: 6 }, () => '<div class="skeleton-card"><div></div><i></i><i></i></div>').join('');
  return chrome(route, `<section class="loading-view" aria-busy="true" aria-label="Loading store"><div class="loading-hero"></div><div class="skeleton-grid">${skeletons}</div></section>`);
}

function errorView(route: PublicRoute, error: unknown): string {
  const message = error instanceof Error ? error.message : 'The store could not be loaded.';
  return chrome(route, `<section class="state-page"><span class="state-code">Connection interrupted</span><h1>Couldn’t open the vault.</h1><p>${escapeHtml(message)}</p><button class="button button-primary" type="button" data-retry>Try again</button></section>`);
}

function productCard(product: Product, index = 0): string {
  const media = mediaFor(product)[0];
  const original = Number.parseFloat(product.origPrice || '');
  const current = Number.parseFloat(product.price || '0');
  return `<a class="product-card reveal" style="--delay:${Math.min(index, 8) * 45}ms" href="${productPath(product)}">
    <div class="product-card-media">
      ${media?.type !== 'video' && media?.url
        ? `<img src="${escapeHtml(media.url)}" alt="${escapeHtml(media.alt || product.name)}" loading="lazy" decoding="async">`
        : `<div class="media-placeholder" aria-hidden="true"><b>${escapeHtml(product.name.slice(0, 2).toUpperCase())}</b><span>ShadowGLB</span></div>`}
      ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ''}
      <span class="product-type">${escapeHtml(product.ptype || 'Playbook')}</span>
    </div>
    <div class="product-card-body">
      <span class="product-category">${escapeHtml(product.category || 'Digital resource')}</span>
      <h3>${escapeHtml(product.name)}</h3>
      ${product.sold ? `<span class="product-sold">${escapeHtml(product.sold)} acquired</span>` : ''}
      <div class="product-card-foot"><strong>${formatMoney(product.price)}</strong>${Number.isFinite(original) && original > current ? `<del>${formatMoney(original)}</del>` : ''}<i aria-hidden="true">↗</i></div>
    </div>
  </a>`;
}

function emptyState(message: string): string {
  return `<div class="empty-state"><span>Nothing published here yet.</span><p>${escapeHtml(message)}</p></div>`;
}

function trustStrip(items: string[]): string {
  const content = items.length ? items : ['Secure checkout', 'Verified payment', 'Instant digital access', 'Operator tested'];
  const repeated = [...content, ...content];
  return `<div class="trust-strip" aria-label="Store benefits"><div>${repeated.map((item) => `<span><i>◆</i>${escapeHtml(item)}</span>`).join('')}</div></div>`;
}

function installReveals(): void {
  const nodes = document.querySelectorAll<HTMLElement>('.reveal');
  if (!('IntersectionObserver' in window)) {
    nodes.forEach((node) => node.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        (entry.target as HTMLElement).classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  nodes.forEach((node) => observer.observe(node));
}

function installRail(rail: HTMLElement): void {
  const cards = Array.from(rail.querySelectorAll<HTMLElement>('.feature-card'));
  const dots = document.querySelector<HTMLElement>('.rail-dots');
  let down = false;
  let moved = false;
  let startX = 0;
  let startScroll = 0;
  const update = (): void => {
    if (!cards.length) return;
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let active = 0;
    let distance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      if (Math.abs(cardCenter - center) < distance) {
        active = index;
        distance = Math.abs(cardCenter - center);
      }
      card.classList.toggle('is-active', index === active);
    });
    dots?.querySelectorAll('button').forEach((dot, index) => dot.classList.toggle('is-active', index === active));
  };
  rail.addEventListener('scroll', update, { passive: true });
  rail.addEventListener('pointerdown', (event) => {
    down = true; moved = false; startX = event.clientX; startScroll = rail.scrollLeft;
    rail.setPointerCapture(event.pointerId);
  });
  rail.addEventListener('pointermove', (event) => {
    if (!down) return;
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 5) moved = true;
    rail.scrollLeft = startScroll - delta;
  });
  const end = (): void => { down = false; };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointercancel', end);
  rail.addEventListener('click', (event) => { if (moved) event.preventDefault(); }, true);
  document.querySelectorAll<HTMLButtonElement>('[data-rail-move]').forEach((button) => button.addEventListener('click', () => {
    rail.scrollBy({ left: Number(button.dataset.railMove) * rail.clientWidth * 0.78, behavior: 'smooth' });
  }));
  dots?.querySelectorAll<HTMLButtonElement>('button').forEach((dot, index) => dot.addEventListener('click', () => cards[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })));
  requestAnimationFrame(update);
}

function renderCollectionGrid(products: Product[], target: HTMLElement): void {
  target.innerHTML = products.length
    ? products.map((product, index) => productCard(product, index)).join('')
    : emptyState('New drops will appear as soon as they are published.');
  installReveals();
}

function renderHome(store: PublicStore): void {
  if (!app) return;
  const products = store.products.filter((product) => !isSystemsProduct(product));
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  const featured = products.slice(0, 8);
  const allLabel = store.content.allLabel || 'All';
  const content = `<section class="hero home-hero">
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-content"><span class="eyebrow">${escapeHtml(store.content.eyebrow || 'Operator resources')}</span><h1>${escapeHtml(store.content.title || 'Systems built to move.').replace(/\n/g, '<br>')}</h1><p>${escapeHtml(store.content.sub || 'Digital playbooks, operator frameworks and practical resources. No theory. Only what works.')}</p><small>SHADOWGLB // RELEASE 03</small></div>
    </section>
    <section class="filter-section" aria-label="Product filters"><div class="filter-chips"><button class="chip is-active" type="button" data-category="">${escapeHtml(allLabel)}</button>${categories.map((category) => `<button class="chip" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('')}</div></section>
    ${featured.length ? `<section class="featured-section section-wrap"><div class="section-heading"><div><span>Featured drop</span><h2>Built for action.</h2></div><div class="rail-controls"><button type="button" data-rail-move="-1" aria-label="Previous featured product">←</button><button type="button" data-rail-move="1" aria-label="Next featured product">→</button></div></div><div class="feature-rail">${featured.map((product, index) => `<a class="feature-card${index === 0 ? ' is-active' : ''}" href="${productPath(product)}"><div>${mediaFor(product)[0]?.url ? `<img src="${escapeHtml(mediaFor(product)[0]?.url)}" alt="${escapeHtml(product.name)}">` : `<span class="feature-placeholder">${escapeHtml(product.name.slice(0, 2).toUpperCase())}</span>`}</div><small>${escapeHtml(product.category)}</small><h3>${escapeHtml(product.name)}</h3><strong>${formatMoney(product.price)}</strong></a>`).join('')}</div><div class="rail-dots" aria-label="Choose featured product">${featured.map((product, index) => `<button type="button" class="${index === 0 ? 'is-active' : ''}" aria-label="Show ${escapeHtml(product.name)}"></button>`).join('')}</div></section>` : ''}
    <section class="catalogue section-wrap"><div class="section-heading"><div><span>The store</span><h2>Operator vault.</h2></div><p><b data-product-count>${products.length}</b> live resources</p></div><div class="product-grid" data-product-grid>${products.length ? products.map((product, index) => productCard(product, index)).join('') : emptyState('The next release is being prepared.')}</div></section>
    ${trustStrip(store.content.strip || [])}`;
  app.innerHTML = chrome('home', content, store);
  bindChrome();
  const grid = document.querySelector<HTMLElement>('[data-product-grid]');
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('is-active', chip === button));
    const filtered = button.dataset.category ? products.filter((product) => product.category === button.dataset.category) : products;
    if (grid) renderCollectionGrid(filtered, grid);
    const count = document.querySelector<HTMLElement>('[data-product-count]');
    if (count) count.textContent = String(filtered.length);
  }));
  const rail = document.querySelector<HTMLElement>('.feature-rail');
  if (rail) installRail(rail);
  installReveals();
  setMeta('ShadowGLB — The Store', store.content.sub || 'Digital systems, playbooks and operator resources.');
}

function renderSystems(store: PublicStore): void {
  if (!app) return;
  const products = store.products.filter(isSystemsProduct);
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  const content = `<section class="route-intro compact-intro"><h1 class="sr-only">Systems &amp; Templates</h1><span class="eyebrow">Systems &amp; Templates // Operator builds</span><p>${escapeHtml(store.content.systemsSub || 'Working builds and ready-to-run templates. Plug them into the operation and move.')}</p></section>
    <section class="filter-section route-filters" aria-label="Systems filters"><div class="filter-chips"><button class="chip is-active" type="button" data-category="">All builds</button>${categories.map((category) => `<button class="chip" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('')}</div></section>
    <section class="catalogue section-wrap route-catalogue"><div class="section-heading"><div><span>Deployable assets</span><h2 class="sr-only">Available systems and templates</h2></div><p><b data-product-count>${products.length}</b> live builds</p></div><div class="product-grid systems-grid" data-product-grid>${products.length ? products.map((product, index) => productCard(product, index)).join('') : emptyState('Systems and templates will appear here when published.')}</div></section>
    ${trustStrip(store.content.strip || [])}`;
  app.innerHTML = chrome('systems', content, store);
  bindChrome();
  const grid = document.querySelector<HTMLElement>('[data-product-grid]');
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-category]').forEach((chip) => chip.classList.toggle('is-active', chip === button));
    const filtered = button.dataset.category ? products.filter((product) => product.category === button.dataset.category) : products;
    if (grid) renderCollectionGrid(filtered, grid);
    const count = document.querySelector<HTMLElement>('[data-product-count]');
    if (count) count.textContent = String(filtered.length);
  }));
  installReveals();
  setMeta('Systems & Templates — ShadowGLB', 'Ready-to-run digital systems and operator templates from ShadowGLB.');
}

function renderWall(store: PublicStore): void {
  if (!app) return;
  const gallery = store.gallery;
  const content = `<section class="route-intro wall-intro"><h1 class="sr-only">The Wall</h1><span class="eyebrow">The Wall // Visual archive</span><p>${escapeHtml(store.content.wallSub || 'A visual record. Tap any frame to enter.')}</p></section>
    <section class="wall-wrap" aria-label="ShadowGLB image wall">${gallery.length ? `<div class="wall-grid">${gallery.map((item, index) => `<button class="wall-item reveal" type="button" data-wall-index="${index}" aria-label="Open ${escapeHtml(item.alt || `visual ${index + 1}`)}"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || `ShadowGLB visual ${index + 1}`)}" loading="lazy" decoding="async"><span>${String(index + 1).padStart(2, '0')}</span></button>`).join('')}</div>` : emptyState('The visual archive is ready for its first image.')}</section>
    <div class="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer" aria-hidden="true"><button class="lightbox-close" type="button" aria-label="Close image viewer">×</button><button class="lightbox-prev" type="button" aria-label="Previous image">←</button><figure><img alt=""><figcaption></figcaption></figure><button class="lightbox-next" type="button" aria-label="Next image">→</button></div>`;
  app.innerHTML = chrome('wall', content, store);
  bindChrome();
  const lightbox = document.querySelector<HTMLElement>('.lightbox');
  const image = lightbox?.querySelector<HTMLImageElement>('img');
  const caption = lightbox?.querySelector<HTMLElement>('figcaption');
  let active = 0;
  let startX = 0;
  const show = (index: number): void => {
    if (!gallery.length || !lightbox || !image) return;
    active = (index + gallery.length) % gallery.length;
    const item = gallery[active];
    if (!item) return;
    image.src = item.url;
    image.alt = item.alt || `ShadowGLB visual ${active + 1}`;
    if (caption) caption.textContent = `${String(active + 1).padStart(2, '0')} / ${String(gallery.length).padStart(2, '0')}`;
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    lightbox.querySelector<HTMLButtonElement>('.lightbox-close')?.focus();
  };
  const close = (): void => {
    lightbox?.classList.remove('is-open');
    lightbox?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  };
  document.querySelectorAll<HTMLButtonElement>('[data-wall-index]').forEach((button) => button.addEventListener('click', () => show(Number(button.dataset.wallIndex))));
  lightbox?.querySelector('.lightbox-close')?.addEventListener('click', close);
  lightbox?.querySelector('.lightbox-prev')?.addEventListener('click', () => show(active - 1));
  lightbox?.querySelector('.lightbox-next')?.addEventListener('click', () => show(active + 1));
  lightbox?.addEventListener('pointerdown', (event) => { startX = event.clientX; });
  lightbox?.addEventListener('pointerup', (event) => {
    const delta = event.clientX - startX;
    if (Math.abs(delta) > 60) show(active + (delta < 0 ? 1 : -1));
  });
  document.addEventListener('keydown', (event) => {
    if (!lightbox?.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') show(active - 1);
    if (event.key === 'ArrowRight') show(active + 1);
  });
  installReveals();
  setMeta('The Wall — ShadowGLB', 'The image-only visual archive from ShadowGLB.');
}

function renderProduct(store: PublicStore): void {
  if (!app) return;
  const parts = window.location.pathname.replace(/\/+$/, '').split('/');
  const id = decodeURIComponent(parts.at(-1) || '');
  const product = store.products.find((item) => String(item.id) === id);
  if (!product) {
    app.innerHTML = chrome('product', `<section class="state-page"><span class="state-code">404</span><h1>Product not found.</h1><p>This resource may have moved or is no longer published.</p><a class="button button-primary" href="/">Back to the store</a></section>`, store);
    bindChrome();
    setMeta('Product not found — ShadowGLB', 'The requested ShadowGLB product could not be found.');
    return;
  }
  const media = mediaFor(product);
  const collection = store.products.filter((item) => isSystemsProduct(item) === isSystemsProduct(product));
  const position = collection.findIndex((item) => String(item.id) === String(product.id));
  const original = Number.parseFloat(product.origPrice || '');
  const current = Number.parseFloat(product.price || '0');
  const content = `<article class="product-page">
    <div class="product-route-bar"><a href="${isSystemsProduct(product) ? '/systems/' : '/'}">← Back to ${isSystemsProduct(product) ? 'Systems' : 'Store'}</a><span>${position + 1} / ${collection.length}</span></div>
    <div class="product-layout" data-product-swipe>
      <section class="product-gallery" aria-label="${escapeHtml(product.name)} media">
        <div class="media-carousel">${media.length ? media.map((item) => item.type === 'video' ? `<div class="media-slide"><video controls preload="metadata" src="${escapeHtml(item.url)}"></video></div>` : `<div class="media-slide"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || product.name)}"></div>`).join('') : `<div class="media-slide"><div class="product-hero-placeholder"><b>${escapeHtml(product.name.slice(0, 2).toUpperCase())}</b><span>SHADOWGLB</span></div></div>`}</div>
        ${media.length > 1 ? `<div class="media-dots">${media.map((_, index) => `<button class="${index === 0 ? 'is-active' : ''}" type="button" aria-label="Show media ${index + 1}"></button>`).join('')}</div>` : ''}
      </section>
      <section class="product-copy">
        <div class="product-kicker"><span>${escapeHtml(product.ptype || 'Playbook')}</span><i>${escapeHtml(product.category)}</i></div>
        <h1>${escapeHtml(product.name)}</h1>
        <p class="product-description">${escapeHtml(product.desc || '')}</p>
        ${product.tags?.length ? `<div class="tag-list">${product.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        ${product.includes?.length ? `<div class="includes"><h2>Inside the build</h2>${product.includes.map((item) => `<div><i>✓</i><span>${escapeHtml(item)}</span></div>`).join('')}</div>` : ''}
        <div class="delivery-note"><b>Instant access after verified payment.</b><span>The secure delivery link appears here and can also be sent to the checkout email.</span></div>
        ${collection.length > 1 ? '<p class="swipe-hint">Swipe this panel to move between products.</p>' : ''}
      </section>
    </div>
    <div class="buy-bar"><div><strong>${formatMoney(product.price)}</strong>${Number.isFinite(original) && original > current ? `<del>${formatMoney(original)}</del>` : ''}<small>One-time payment</small></div>${product.checkoutReady ? `<button class="button button-primary buy-button" type="button" data-product-id="${escapeHtml(product.id)}">Buy securely <span>→</span></button>` : '<div class="product-unavailable" role="status"><b>Currently unavailable</b><span>Checkout will open when delivery is configured.</span></div>'}</div>
    <div class="checkout-error" role="alert" hidden></div>
  </article>`;
  app.innerHTML = chrome('product', content, store);
  bindChrome();
  const carousel = document.querySelector<HTMLElement>('.media-carousel');
  const dots = Array.from(document.querySelectorAll<HTMLElement>('.media-dots button'));
  carousel?.addEventListener('scroll', () => {
    const index = Math.round(carousel.scrollLeft / Math.max(carousel.clientWidth, 1));
    dots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === index));
  }, { passive: true });
  dots.forEach((dot, index) => dot.addEventListener('click', () => carousel?.scrollTo({ left: index * carousel.clientWidth, behavior: 'smooth' })));
  const buy = document.querySelector<HTMLButtonElement>('.buy-button');
  buy?.addEventListener('click', async () => {
    const errorBox = document.querySelector<HTMLElement>('.checkout-error');
    buy.disabled = true;
    buy.innerHTML = 'Opening secure checkout…';
    if (errorBox) errorBox.hidden = true;
    try {
      const result = await requestJson<{ url: string }>('/api/checkout', { method: 'POST', body: JSON.stringify({ productId: product.id }) });
      if (!result.url || !result.url.startsWith('https://checkout.stripe.com/')) throw new Error('Checkout did not return a valid Stripe URL.');
      window.location.assign(result.url);
    } catch (error) {
      buy.disabled = false;
      buy.innerHTML = 'Buy securely <span>→</span>';
      if (errorBox) {
        errorBox.textContent = error instanceof Error ? error.message : 'Checkout could not be opened.';
        errorBox.hidden = false;
      }
      showToast('Checkout could not be opened.', 'error');
    }
  });
  const swipe = document.querySelector<HTMLElement>('[data-product-swipe]');
  let startX = 0;
  let startY = 0;
  swipe?.addEventListener('pointerdown', (event) => {
    if ((event.target as Element).closest('.product-gallery')) return;
    startX = event.clientX; startY = event.clientY;
  });
  swipe?.addEventListener('pointerup', (event) => {
    if ((event.target as Element).closest('.product-gallery')) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4 || collection.length < 2) return;
    const next = collection[(position + (dx < 0 ? 1 : -1) + collection.length) % collection.length];
    if (next) window.location.assign(productPath(next));
  });
  setMeta(`${product.name} — ShadowGLB`, product.desc || `${product.name} from ShadowGLB.`);
}

async function renderSuccess(): Promise<void> {
  if (!app) return;
  const sessionId = new URLSearchParams(window.location.search).get('session_id') || '';
  app.innerHTML = chrome('success', `<section class="success-page"><div class="success-status is-loading"><span></span><h1>Verifying payment.</h1><p>Keep this page open while Stripe confirms the checkout.</p></div></section>`);
  bindChrome();
  setMeta('Confirming purchase — ShadowGLB', 'Securely verifying your ShadowGLB purchase.');
  const target = document.querySelector<HTMLElement>('.success-page');
  if (!sessionId) {
    if (target) target.innerHTML = '<div class="success-status is-error"><span>!</span><h1>No checkout to verify.</h1><p>Open this page from the Stripe confirmation screen.</p><a class="button button-primary" href="/">Return to the store</a></div>';
    return;
  }
  try {
    const result = await requestJson<{ paid: boolean; product?: { name?: string }; deliveryUrl?: string; customerEmail?: string }>(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`);
    if (!result.paid || !result.deliveryUrl) throw new Error('Payment is not marked as paid yet.');
    if (target) target.innerHTML = `<div class="success-status is-success"><span>✓</span><small>Payment verified</small><h1>Access unlocked.</h1><p>${escapeHtml(result.product?.name || 'Your product')} is ready.${result.customerEmail ? ` A confirmation was prepared for ${escapeHtml(result.customerEmail)}.` : ''}</p><a class="button button-primary delivery-button" href="${escapeHtml(result.deliveryUrl)}" target="_blank" rel="noopener">Open your product <b>→</b></a><a class="text-link" href="/">Return to the store</a></div>`;
    setMeta('Purchase complete — ShadowGLB', 'Your verified ShadowGLB purchase is ready.');
  } catch (error) {
    if (target) target.innerHTML = `<div class="success-status is-error"><span>!</span><h1>We couldn’t verify this payment.</h1><p>${escapeHtml(error instanceof Error ? error.message : 'Please try again shortly.')}</p><button class="button button-primary" type="button" data-retry>Check again</button><a class="text-link" href="mailto:${DEFAULT_CONTACT}">Contact support</a></div>`;
    target?.querySelector('[data-retry]')?.addEventListener('click', () => window.location.reload());
  }
}

function renderNotFound(): void {
  if (!app) return;
  app.innerHTML = chrome('not-found', '<section class="state-page"><span class="state-code">404</span><h1>Off the grid.</h1><p>This page does not exist.</p><a class="button button-primary" href="/">Enter the store</a></section>');
  bindChrome();
  setMeta('Page not found — ShadowGLB', 'The requested page could not be found.');
}

async function boot(): Promise<void> {
  if (!app) return;
  const route = routeFromPath(window.location.pathname);
  if (route === 'admin') {
    setMeta('Admin — ShadowGLB', 'Secure ShadowGLB store administration.');
    await renderAdmin(app);
    return;
  }
  if (route === 'success') {
    await renderSuccess();
    return;
  }
  if (route === 'not-found') {
    renderNotFound();
    return;
  }
  app.innerHTML = loadingShell(route);
  bindChrome();
  try {
    const store = normalizeStore(await requestJson<unknown>('/api/store'));
    if (route === 'home') renderHome(store);
    if (route === 'systems') renderSystems(store);
    if (route === 'wall') renderWall(store);
    if (route === 'product') renderProduct(store);
  } catch (error) {
    app.innerHTML = errorView(route, error);
    bindChrome();
    document.querySelector('[data-retry]')?.addEventListener('click', () => window.location.reload());
  }
}

if (app) void boot();
