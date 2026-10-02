/** Registers the service worker (public/sw.js) so the app opens without signal. Production builds only. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker not registered', e));
  });
}
