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

  void import('./app.js');
}
