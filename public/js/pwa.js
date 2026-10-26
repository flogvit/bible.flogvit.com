// Global PWA-øy (#14): registrerer service worker, melder en ny versjon som
// er installert på FLOGVITs felles linje (ny-versjon.js, flogvit-com#339), og
// viser en offline/online-indikator.

import { readStrings } from './locale.js';

const t = readStrings(document.body);

if ('serviceWorker' in navigator) {
  // Siden lastes på nytt BARE når leseren har bedt om det. `controllerchange`
  // fyrer også når den første service workeren tar over en fane som aldri har
  // hatt en (clients.claim), og en omlasting da ville kastet det leseren har
  // skrevet — på første besøk.
  let asked = false;

  /** Den ventende workeren meldes på felles linje; knappen tar den i bruk. */
  const announce = (reg) => {
    window.dispatchEvent(
      new CustomEvent('fv-ny-versjon', {
        detail: {
          last: () => {
            if (!reg.waiting) return location.reload();
            asked = true;
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      }),
    );
  };

  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    // Lagt klar i et tidligere besøk, og venter fortsatt.
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) announce(reg);
      });
    });
  }).catch(() => {});

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!asked) return;
    asked = false;
    location.reload();
  });
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
    badge.textContent = t('pwa.offline');
    badge.dataset.state = 'offline';
    badge.hidden = false;
  } else if (!first) {
    badge.textContent = t('pwa.backOnline');
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
