import type { MediaItem, Product } from './types.js';

interface HomeStore {
  contactEmail: string;
  contactPhone: string;
  telegramUrl: string;
  logo: string;
  announcement: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  products: Product[];
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
// The simpler alternating format `Title`, then `https://live-link` is also
// supported so existing admin content continues to work.
export function parseShowcase(value: unknown): ShowcaseItem[] {
  if (!Array.isArray(value)) return [];
  const lines = value
    .filter((line): line is string => typeof line === 'string')
    .map((line) => line.trim())
    .filter(Boolean);
  const items: ShowcaseItem[] = [];

  const safeHttpsUrl = (candidate: string): string => {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'https:' ? parsed.toString() : '';
    } catch (_error) {
      return '';
    }
  };
  const makeItem = (title: string, description = '', media = '', link = ''): ShowcaseItem => {
    const url = safeHttpsUrl(media);
    return {
      title,
      description,
      url,
      isVideo: /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url),
      link: safeHttpsUrl(link),
    };
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes('|')) {
      const parts = line.split('|').map((part) => part.trim());
      const title = parts[0];
      if (!title || safeHttpsUrl(title)) continue;

      // Handy one-line shorthand: Title|https://live-site
      if (parts.length === 2 && safeHttpsUrl(parts[1])) {
        items.push(makeItem(title, '', '', parts[1]));
        continue;
      }

      items.push(makeItem(title, parts[1] || '', parts[2] || '', parts[3] || ''));
      continue;
    }

    // The live store originally saved showcase entries as alternating lines:
    // title, live URL, title, live URL. Pair those lines instead of rendering
    // the URL as another project title.
    if (safeHttpsUrl(line)) continue;
    const nextLine = lines[index + 1] || '';
    const pairedLink = safeHttpsUrl(nextLine);
    items.push(makeItem(line, '', '', pairedLink));
    if (pairedLink) index += 1;
  }

  return items;
}

const FALLBACK_STORE: HomeStore = {
  contactEmail: 'moshadow154@gmail.com',
  contactPhone: '',
  telegramUrl: 'https://t.me/shadowGLBintel',
  logo: 'SHADOW|GLB',
  announcement: '',
  eyebrow: '[ SELF-SERVE DIGITAL OPERATIONS ]',
  title: 'Built to buy.\nBuilt to move.',
  subtitle: 'Operator kits, field files and practical systems. Secure checkout. Immediate access. No call required.',
  products: [],
};

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
  const products = Array.isArray(source.products)
    ? source.products.filter((item): item is Product => Boolean(item && typeof item === 'object' && 'id' in item && 'name' in item))
    : [];
  const email = typeof content.contactEmail === 'string' && content.contactEmail.includes('@')
    ? content.contactEmail
    : typeof source.contactEmail === 'string' && source.contactEmail.includes('@')
      ? source.contactEmail
      : FALLBACK_STORE.contactEmail;
  return {
    contactEmail: email,
    contactPhone: typeof content.contactPhone === 'string' ? content.contactPhone.trim() : '',
    telegramUrl: normalizeTelegramUrl(content.telegramUrl) || telegramFromSocials(content.socials) || FALLBACK_STORE.telegramUrl,
    logo: typeof content.logo === 'string' && content.logo.trim() ? content.logo.trim() : FALLBACK_STORE.logo,
    announcement: typeof content.announce === 'string' ? content.announce.trim() : '',
    eyebrow: typeof content.landingEyebrow === 'string' && content.landingEyebrow.trim() ? content.landingEyebrow.trim() : FALLBACK_STORE.eyebrow,
    title: typeof content.landingTitle === 'string' && content.landingTitle.trim() ? content.landingTitle.trim() : FALLBACK_STORE.title,
    subtitle: typeof content.landingSub === 'string' && content.landingSub.trim() ? content.landingSub.trim() : FALLBACK_STORE.subtitle,
    products,
  };
}

function cleanLogo(value: string): [string, string] {
  const plain = value.replace(/<\/?span>/gi, '|').replace(/<[^>]+>/g, '').replace(/\|+/g, '|');
  const [lead = 'SHADOW', tail = 'GLB'] = plain.split('|');
  return [lead || 'SHADOW', tail || 'GLB'];
}

export function emailInquiryHref(email: string, subject: string, message: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

export function normalizeWhatsAppNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

export function whatsappInquiryHref(phone: string, message: string): string {
  const number = normalizeWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '';
}

export function normalizeTelegramUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && ['t.me', 'telegram.me', 'www.telegram.me'].includes(host) ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

function telegramFromSocials(value: unknown): string {
  if (!Array.isArray(value)) return '';
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const [label, url] = entry.split('|').map((part) => part.trim());
    if (/telegram|shadow\/?intel/i.test(label || '')) {
      const safe = normalizeTelegramUrl(url);
      if (safe) return safe;
    }
  }
  return '';
}

function productPath(product: Product): string {
  return `/products/${encodeURIComponent(String(product.id))}/`;
}

function productMedia(product: Product | undefined): MediaItem | undefined {
  if (!product) return undefined;
  const media = Array.isArray(product.media)
    ? product.media.find((item) => item && typeof item.url === 'string' && item.url.startsWith('https://'))
    : undefined;
  if (media) return media;
  return product.imageUrl?.startsWith('https://') ? { url: product.imageUrl, type: 'image', alt: product.name } : undefined;
}

function formatMoney(value: string): string {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'FREE';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}

function featuredProduct(store: HomeStore): Product | undefined {
  return store.products.find((product) => product.featured === true)
    || store.products.find((product) => !/^(file|system|template)$/i.test(String(product.ptype || '')))
    || store.products[0];
}

function telegramAction(store: HomeStore, className: string, label: string): string {
  return store.telegramUrl
    ? `<a class="${className}" href="${escapeHtml(store.telegramUrl)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(label)}</span><b>&nearr;</b></a>`
    : `<span class="${className} ops-button--muted" aria-label="Telegram channel link will be added shortly"><span>Channel link pending</span><b>...</b></span>`;
}

function contactActions(store: HomeStore): string {
  const message = 'Hi ShadowGLB, I have a question about a product or order:';
  const email = emailInquiryHref(store.contactEmail, 'ShadowGLB product enquiry', message);
  const whatsapp = whatsappInquiryHref(store.contactPhone, message);
  return `<a class="ops-contact-link" href="${escapeHtml(email)}"><small>Email</small><span>${escapeHtml(store.contactEmail)}</span><b>&nearr;</b></a>${whatsapp ? `<a class="ops-contact-link" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener noreferrer"><small>Support</small><span>WhatsApp</span><b>&nearr;</b></a>` : ''}`;
}

function featuredMarkup(store: HomeStore): string {
  const product = featuredProduct(store);
  if (!product) return `<article class="ops-feature ops-feature--empty reveal"><div><span>FLAGSHIP // LOADING BAY</span><h2>The next release is being prepared.</h2><p>Enter the store to view every live kit, file and system.</p></div><a class="ops-button ops-button--primary" href="/store/"><span>Enter the store</span><b>&nearr;</b></a></article>`;
  const media = productMedia(product);
  return `<article class="ops-feature reveal">
    <a class="ops-feature-media" href="${productPath(product)}" aria-label="View ${escapeHtml(product.name)}"><span>FLAGSHIP // 001</span>${media?.type === 'video' ? `<video src="${escapeHtml(media.url)}" muted loop autoplay playsinline preload="metadata"></video>` : media?.url ? `<img src="${escapeHtml(media.url)}" alt="${escapeHtml(media.alt || product.name)}" loading="eager">` : `<div class="ops-product-mark"><small>SHADOWGLB</small><b>${escapeHtml(product.name.slice(0, 2).toUpperCase())}</b></div>`}</a>
    <div class="ops-feature-copy"><div class="ops-feature-top"><span>${escapeHtml(product.ptype || product.category || 'Operator kit')}</span><strong>${formatMoney(product.price)}</strong></div><h2>${escapeHtml(product.name)}</h2><p>${escapeHtml(product.desc || 'A practical digital resource built for immediate use.')}</p>${product.includes?.length ? `<ul>${product.includes.slice(0, 4).map((item) => `<li><i>&check;</i><span>${escapeHtml(item)}</span></li>`).join('')}</ul>` : ''}<div class="ops-feature-actions"><a class="ops-button ops-button--primary" href="${productPath(product)}"><span>View the drop</span><b>&nearr;</b></a><a class="ops-text-link" href="/store/">Browse everything <b>&rarr;</b></a></div></div>
  </article>`;
}

function template(store: HomeStore): string {
  const [logoLead, logoTail] = cleanLogo(store.logo);
  const stages = ['DISCOVER', 'TRUST', 'BUY', 'RECEIVE', 'STAY', 'DISCOVER', 'TRUST', 'BUY', 'RECEIVE', 'STAY'];
  return `${store.announcement ? `<div class="ops-announce" role="status"><span>${escapeHtml(store.announcement)}</span><button type="button" aria-label="Dismiss announcement">&times;</button></div>` : ''}
    <header class="ops-nav"><a class="ops-brand" href="/" aria-label="ShadowGLB home"><span>${escapeHtml(logoLead)}</span><b>${escapeHtml(logoTail)}</b></a><nav aria-label="Primary navigation"><a class="is-active" href="/">Home</a><a href="/store/">Operator Kits</a><a href="/systems/">Systems</a><a href="/files/">The Files</a><a href="/wall/">The Wall</a><a href="#intel">Free Intel</a></nav><div class="ops-nav-actions">${store.telegramUrl ? `<a href="${escapeHtml(store.telegramUrl)}" target="_blank" rel="noopener noreferrer">Join Intel <b>&nearr;</b></a>` : '<a href="/store/">Enter store <b>&nearr;</b></a>'}<button class="ops-menu-button" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="ops-mobile-menu"><span></span><span></span></button></div></header>
    <div class="ops-mobile-menu" id="ops-mobile-menu" aria-hidden="true"><div><span>Navigation</span><button type="button" aria-label="Close navigation">&times;</button></div><nav aria-label="Mobile navigation"><a href="/"><small>01</small><span>Home</span></a><a href="/store/"><small>02</small><span>Operator Kits</span></a><a href="/systems/"><small>03</small><span>Systems</span></a><a href="/files/"><small>04</small><span>The Files</span></a><a href="/wall/"><small>05</small><span>The Wall</span></a><a href="#intel"><small>06</small><span>Free Intel</span></a><a href="/contact/"><small>07</small><span>Contact</span></a></nav><p>SHADOWGLB // SELF-SERVE NETWORK</p></div>
    <main id="main-content">
      <section class="ops-hero"><div class="ops-grid" aria-hidden="true"></div><div class="ops-signal" aria-hidden="true"><i></i><i></i><span>SG</span></div><div class="ops-hero-copy reveal"><span class="ops-kicker">${escapeHtml(store.eyebrow)}</span><h1>${escapeHtml(store.title).replace(/\n/g, '<br>')}</h1><p>${escapeHtml(store.subtitle)}</p><div class="ops-hero-actions"><a class="ops-button ops-button--primary" href="/store/"><span>Enter the store</span><b>&nearr;</b></a><a class="ops-button ops-button--ghost" href="#flagship"><span>View flagship</span><b>&darr;</b></a></div></div><div class="ops-hero-status"><span><i></i> STORE ONLINE</span><span>STRIPE SECURED</span><span>AUTO DELIVERY</span></div></section>
      <div class="ops-ticker" aria-label="ShadowGLB buying journey"><div>${stages.map((item) => `<span>${item}<i>+</i></span>`).join('')}</div></div>
      <section class="ops-section" id="flagship" aria-labelledby="flagship-title"><div class="ops-heading reveal"><span>[ 01 / FEATURED DROP ]</span><div><h2 id="flagship-title">Start with the strongest asset.</h2><p>One clear product. One secure payment. Immediate access after verification.</p></div></div>${featuredMarkup(store)}</section>
      <section class="ops-section" aria-labelledby="archive-title"><div class="ops-heading reveal"><span>[ 02 / THE ARCHIVE ]</span><div><h2 id="archive-title">Choose your entry point.</h2><p>Everything has a purpose. No filler, fake scarcity or call required.</p></div></div><div class="ops-archive-grid">
        <a class="ops-archive-card reveal" href="/store/"><small>01 // KITS</small><h3>Operator Kits</h3><p>Complete resources for turning a skill into a clear offer and repeatable process.</p><span>Browse kits <b>&nearr;</b></span></a><a class="ops-archive-card reveal" href="/systems/"><small>02 // SYSTEMS</small><h3>Systems &amp; Templates</h3><p>Ready-to-run structures, templates and practical operating assets.</p><span>Open systems <b>&nearr;</b></span></a><a class="ops-archive-card ops-archive-card--file reveal" href="/files/"><small>03 // CLASSIFIED</small><h3>The Files</h3><p>Focused business files, frameworks and field-tested operator intel.</p><span>Access files <b>&nearr;</b></span></a><a class="ops-archive-card reveal" href="/wall/"><small>04 // PROOF</small><h3>The Wall</h3><p>Visuals, product previews and the record of what SHADOW is building.</p><span>View the wall <b>&nearr;</b></span></a>
      </div></section>
      <section class="ops-section ops-intel" id="intel" aria-labelledby="intel-title"><div class="ops-intel-copy reveal"><span>[ 03 / FREE INTEL ]</span><h2 id="intel-title">Get value before you buy.</h2><p>Shadow / Intel is the public channel: useful breakdowns, product drops, build logs and updates. Buyers can receive private access separately after verified payment.</p><div>${telegramAction(store, 'ops-button ops-button--primary', 'Join Shadow / Intel')}<a class="ops-text-link" href="/store/">Or enter the store <b>&rarr;</b></a></div></div><div class="ops-terminal reveal" aria-label="Shadow Intel feed preview"><header><span>SHADOW / INTEL</span><i>PUBLIC CHANNEL</i></header><div><p><small>INTEL // 001</small><b>Clear offers beat complicated tools.</b><span>Practical breakdowns. No empty motivation.</span></p><p><small>DROP // ACTIVE</small><b>New assets go live here first.</b><span>Products, previews and release notes.</span></p><p><small>LOG // OPEN</small><b>The operation is built in public.</b><span>What changed, what shipped, what comes next.</span></p></div><footer><i></i><span>TRANSMISSION OPEN</span></footer></div></section>
      <section class="ops-section" aria-labelledby="logs-title"><div class="ops-heading reveal"><span>[ 04 / BUILT IN PUBLIC ]</span><div><h2 id="logs-title">Follow the operation.</h2><p>The content is the proof: what is being built, why it matters and where to access it.</p></div></div><div class="ops-log-grid"><article class="reveal"><small>BUILD LOG // 001</small><h3>The store was rebuilt around one journey.</h3><p>Discover, trust, buy, receive, stay. Every page now has a commercial job.</p></article><article class="reveal"><small>BUILD LOG // 002</small><h3>Products are packaged for immediate access.</h3><p>Secure checkout and digital delivery stay at the centre of the operation.</p></article><article class="reveal"><small>BUILD LOG // NEXT</small><h3>The flagship drop is the current focus.</h3><p>One product, repeated proof and a direct path from content to checkout.</p></article></div></section>
      <section class="ops-section ops-network reveal" aria-labelledby="network-title"><span>[ 05 / ENTER THE NETWORK ]</span><h2 id="network-title">Public intel now.<br>Private network later.</h2><p>The future Shadow Network will be earned by building a real audience and customer base first. For now: join the public channel, use the products and stay close to the next release.</p><div class="ops-network-actions">${telegramAction(store, 'ops-button ops-button--primary', 'Enter Shadow / Intel')}<a class="ops-button ops-button--ghost" href="/store/"><span>Shop the archive</span><b>&nearr;</b></a></div></section>
      <section class="ops-contact"><div><span>[ SUPPORT / DIRECT LINE ]</span><h2>Need help with a product or order?</h2><p>Email and WhatsApp are support routes. Every product purchase remains self-serve.</p></div><div class="ops-contact-actions">${contactActions(store)}</div></section>
    </main>
    <footer class="ops-footer"><a href="/">SHADOW<span>GLB</span></a><nav><a href="/store/">Kits</a><a href="/systems/">Systems</a><a href="/files/">Files</a><a href="/wall/">Wall</a><a href="/contact/">Contact</a><a href="/admin/">Admin</a></nav><p>&copy; 2026 Shadow Global &middot; TCF Firm Ltd</p></footer>`;
}

function bindInteractions(): void {
  const menu = document.querySelector<HTMLElement>('.ops-mobile-menu');
  const open = document.querySelector<HTMLButtonElement>('.ops-menu-button');
  const close = menu?.querySelector<HTMLButtonElement>(':scope > div button');
  const setMenu = (visible: boolean): void => {
    menu?.classList.toggle('is-open', visible);
    menu?.setAttribute('aria-hidden', String(!visible));
    open?.setAttribute('aria-expanded', String(visible));
    document.body.classList.toggle('ops-menu-open', visible);
    if (visible) close?.focus();
  };
  open?.addEventListener('click', () => setMenu(true));
  close?.addEventListener('click', () => setMenu(false));
  menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
  document.onkeydown = (event) => { if (event.key === 'Escape') setMenu(false); };
  document.querySelector<HTMLButtonElement>('.ops-announce button')?.addEventListener('click', (event) => {
    (event.currentTarget as HTMLElement).closest('.ops-announce')?.remove();
  });

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
  document.title = 'ShadowGLB — Digital products for operators';
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', 'Operator kits, business files and practical digital systems with secure checkout and immediate delivery.');
  bindInteractions();
}

let revealsDone = false;
const CACHE_KEY = 'shadowglb_landing_v2';

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
