/* FLOGVIT — «Ny versjon er lagt ut» (portal/VERSJON.md, flogvit-com#339).
 *
 * KOPI. Fila eies av portal/design/ny-versjon.js og er lik byte for byte i hvert
 * produkt. Endre den i portalen, og skriv kopiene med `bun versjonskopi.ts
 * --skriv` i meta-repoet; produktets egen test feller når kopien avviker.
 *
 * Siden bærer bygget den ble rendret fra:
 *   <meta name="fv-versjon" content="<bygg-id>" data-url="/versjon.json">
 * Skriptet spør `data-url` (standard /versjon.json) om bygget som serveres NÅ —
 * hvert femte minutt mens fanen er synlig, og når den blir synlig igjen. Er det
 * et annet, vises en linje nederst med en knapp. Den laster aldri siden selv:
 * en side der noen skriver, skal ikke miste det. Har siden ulagret input, ber
 * knappen om ett klikk til.
 *
 * Ingen import, ingen eksport: lastes som klassisk <script defer>, eller
 * importeres for sidevirkningen inn i et produkts egen bunt.
 */
(() => {
  'use strict';

  /* chrome-i18n.json: version.* — portalens test holder dem like. */
  const STRENGER = {
    en: { new: 'A new version is out', reload: 'Reload', later: 'Later', unsaved: 'You have unsaved changes on this page. Reload anyway?' },
    nb: { new: 'Ny versjon er lagt ut', reload: 'Last inn på nytt', later: 'Senere', unsaved: 'Du har endringer på siden som ikke er lagret. Laste inn likevel?' },
    nn: { new: 'Ny versjon er lagd ut', reload: 'Last inn på nytt', later: 'Seinare', unsaved: 'Du har endringar på sida som ikkje er lagra. Laste inn likevel?' },
    sv: { new: 'En ny version har publicerats', reload: 'Ladda om', later: 'Senare', unsaved: 'Du har osparade ändringar på sidan. Ladda om ändå?' },
    fr: { new: 'Une nouvelle version est en ligne', reload: 'Recharger', later: 'Plus tard', unsaved: 'Vous avez des modifications non enregistrées sur cette page. Recharger quand même ?' },
    es: { new: 'Hay una nueva versión', reload: 'Recargar', later: 'Más tarde', unsaved: 'Tienes cambios sin guardar en esta página. ¿Recargar de todos modos?' },
    fi: { new: 'Uusi versio on julkaistu', reload: 'Lataa uudelleen', later: 'Myöhemmin', unsaved: 'Sivulla on tallentamattomia muutoksia. Ladataanko silti?' },
    de: { new: 'Eine neue Version ist da', reload: 'Neu laden', later: 'Später', unsaved: 'Diese Seite hat ungespeicherte Änderungen. Trotzdem neu laden?' },
  };

  /** Hvor ofte en synlig fane spør. Fem minutter koster ingenting og er tidsnok. */
  const INTERVALL_MS = 5 * 60 * 1000;
  /** Minste avstand mellom to spørsmål, uansett hva som utløser dem. */
  const PUSTEROM_MS = 30 * 1000;

  const meta = document.querySelector('meta[name="fv-versjon"]');
  const bygg = meta ? meta.getAttribute('content') || '' : '';
  const url = (meta && meta.getAttribute('data-url')) || '/versjon.json';

  let sist = 0;
  let viser = '';
  let avvist = '';
  let last = () => location.reload();

  function tekst(nokkel) {
    let l = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
    if (l === 'no') l = 'nb';
    return (STRENGER[l] || STRENGER.en)[nokkel];
  }

  /** Står det noe på siden som går tapt ved en omlasting? */
  function ulagret() {
    if (document.querySelector('[data-fv-ulagret]')) return true;
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (el.closest('.fv-ny-versjon')) continue;
      if (el.tagName === 'SELECT') {
        if ([...el.options].some((o) => o.selected !== o.defaultSelected)) return true;
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== el.defaultChecked) return true;
      } else if (!['hidden', 'button', 'submit', 'reset', 'image', 'file', 'search'].includes(el.type)) {
        if (el.value !== el.defaultValue) return true;
      }
    }
    return false;
  }

  const STIL = `
.fv-ny-versjon{position:fixed;z-index:2147483000;left:16px;right:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px));
  margin:0 auto;width:fit-content;max-width:calc(100vw - 32px);box-sizing:border-box;
  display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 12px 10px 16px;
  border-radius:var(--radius, 10px);background:var(--ink, #1b1b18);color:var(--paper, #faf9f6);
  font-family:var(--font-ui, system-ui, sans-serif);font-size:1rem;line-height:1.35;box-shadow:0 6px 24px rgba(0,0,0,.28)}
.fv-ny-versjon>span{min-width:0;flex:1 1 12em;overflow-wrap:anywhere}
.fv-ny-versjon button{font:inherit;cursor:pointer;min-height:2.5em;padding:.35em .9em;border-radius:var(--radius-pill, 999px);
  border:1px solid currentColor;background:transparent;color:inherit}
.fv-ny-versjon button.fv-ny-versjon-last{background:var(--paper, #faf9f6);color:var(--ink, #1b1b18);border-color:transparent;font-weight:600}
.fv-ny-versjon button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media print{.fv-ny-versjon{display:none}}`;

  function vis(id, slik) {
    if (slik) last = slik;
    if (id === avvist || document.querySelector('.fv-ny-versjon')) return;
    viser = id;
    if (!document.getElementById('fv-ny-versjon-stil')) {
      const s = document.createElement('style');
      s.id = 'fv-ny-versjon-stil';
      s.textContent = STIL;
      document.head.append(s);
    }
    const linje = document.createElement('div');
    linje.className = 'fv-ny-versjon';
    linje.setAttribute('role', 'status');
    linje.setAttribute('aria-live', 'polite');
    const melding = document.createElement('span');
    melding.textContent = tekst('new');
    const knapp = document.createElement('button');
    knapp.type = 'button';
    knapp.className = 'fv-ny-versjon-last';
    knapp.textContent = tekst('reload');
    let bekreftet = false;
    knapp.addEventListener('click', () => {
      if (!bekreftet && ulagret()) {
        bekreftet = true;
        melding.textContent = tekst('unsaved');
        return;
      }
      last();
    });
    const senere = document.createElement('button');
    senere.type = 'button';
    senere.className = 'fv-ny-versjon-senere';
    senere.textContent = tekst('later');
    senere.addEventListener('click', () => {
      avvist = viser;
      linje.remove();
    });
    linje.append(melding, knapp, senere);
    document.body.append(linje);
  }

  async function sjekk() {
    if (!bygg || document.visibilityState === 'hidden') return;
    const naa = Date.now();
    if (naa - sist < PUSTEROM_MS) return;
    sist = naa;
    try {
      const svar = await fetch(url, { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!svar.ok) return;
      const ny = (await svar.json()).build;
      // Et svar uten id er en deploy på vei, ikke en ny versjon.
      if (typeof ny === 'string' && ny && ny !== bygg) vis(ny);
    } catch {
      // Ikke svar er ikke en ny versjon. Neste runde spør igjen.
    }
  }

  /* En service worker som har lagt klar en ny versjon (bibel), melder seg her
     med hvordan den tas i bruk — samme linje, ikke et eget banner. */
  window.addEventListener('fv-ny-versjon', (e) => {
    const d = e.detail || {};
    vis(d.id || 'service-worker', typeof d.last === 'function' ? d.last : undefined);
  });

  if (!bygg) return;
  setInterval(sjekk, INTERVALL_MS);
  document.addEventListener('visibilitychange', sjekk);
  window.addEventListener('online', sjekk);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) sjekk();
  });
})();
