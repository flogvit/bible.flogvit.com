/* FLOGVIT «Ekte besøk». Kopi av portal/design — se BESOK.md. */
(() => {
  const n = navigator, d = document, H = ['pointerdown', 'keydown', 'scroll'];
  if (window.fvBesok || n.webdriver || n.globalPrivacyControl || n.doNotTrack == '1') return;
  window.fvBesok = 1;
  let igjen = 15e3, fra = 0, tid = 0, sendt = 0;
  const send = () => {
    if (sendt) return;
    sendt = 1;
    clearTimeout(tid);
    H.forEach((h) => removeEventListener(h, send, true));
    fetch('/fv-besok', { method: 'POST', keepalive: true, credentials: 'omit' }).catch(send);
  };
  const klokke = () => {
    clearTimeout(tid);
    if (fra) igjen -= Date.now() - fra;
    fra = 0;
    if (!sendt && d.visibilityState == 'visible' && !d.prerendering) {
      fra = Date.now();
      tid = setTimeout(send, igjen);
    }
  };
  H.forEach((h) => addEventListener(h, send, { capture: true, passive: true }));
  d.addEventListener('visibilitychange', klokke);
  d.addEventListener('prerenderingchange', klokke);
  klokke();
})();
