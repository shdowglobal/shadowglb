const path = window.location.pathname.replace(/\/+$/, '') || '/';

if (path === '/') {
  void import('./homepage.js').then(({ renderHomePage }) => renderHomePage());
} else {
  // The legacy storefront router owns every existing route. Force its home
  // links through a real navigation so they return to the new services entry.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link || link.getAttribute('href') !== '/') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign('/');
  }, true);

  const labelHomeLinks = (): void => {
    document.querySelectorAll<HTMLAnchorElement>('.desktop-nav a[href="/"], .mobile-menu a[href="/"]').forEach((link) => {
      const label = link.querySelector('span');
      if (label) label.textContent = 'Services';
      else link.textContent = 'Services';
    });
  };
  new MutationObserver(labelHomeLinks).observe(document.documentElement, { childList: true, subtree: true });
  void import('./app.js').then(labelHomeLinks);
}
