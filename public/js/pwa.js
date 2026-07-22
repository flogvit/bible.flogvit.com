// Global PWA-øy (#14): registrerer service worker, viser oppdaterings-banner
// når en ny versjon er installert, og en offline/online-indikator.

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(reg);
      });
    });
  }).catch(() => {});

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function showUpdateBanner(reg) {
  if (document.querySelector('.pwa-update')) return;
  const bar = document.createElement('div');
  bar.className = 'pwa-update';
  bar.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = 'En ny versjon av bibelen er tilgjengelig.';
  const update = document.createElement('button');
  update.type = 'button';
  update.className = 'pwa-update-btn';
  update.textContent = 'Oppdater nå';
  update.addEventListener('click', () => {
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'pwa-update-later';
  later.textContent = 'Senere';
  later.addEventListener('click', () => bar.remove());
  bar.append(text, update, later);
  document.body.append(bar);
}

// ── Offline/online-indikator ─────────────────────────────────────────
const badge = document.createElement('div');
badge.className = 'pwa-net';
badge.hidden = true;
document.body.append(badge);
let onlineTimer = null;

function setNet(online, first) {
  clearTimeout(onlineTimer);
  if (!online) {
    badge.textContent = 'Offline';
    badge.dataset.state = 'offline';
    badge.hidden = false;
  } else if (!first) {
    badge.textContent = 'Online igjen';
    badge.dataset.state = 'online';
    badge.hidden = false;
    onlineTimer = setTimeout(() => (badge.hidden = true), 2000);
  } else {
    badge.hidden = true;
  }
}
setNet(navigator.onLine, true);
window.addEventListener('offline', () => setNet(false));
window.addEventListener('online', () => setNet(true));
