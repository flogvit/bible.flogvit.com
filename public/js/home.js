// Forside-øy: bytter «Velkommen»-blokka til «Fortsett å lese» hvis en
// leseposisjon finnes i localStorage (nøkkel/format datakompatibelt med gamle
// appen: 'bible-reading-position' → {bookSlug, bookName, chapter, verse}).
// Uten JS vises velkomst-varianten. Aktiv leseplan er markert som TODO — den
// fulle plan-innmatingen kommer med brukersidene (#12).

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const cont = document.getElementById('home-continue');
if (cont) {
  const pos = readJSON('bible-reading-position');
  if (pos && pos.bookSlug && pos.chapter) {
    const url = `/${pos.bookSlug}/${pos.chapter}#v${pos.verse || 1}`;
    const title = `${pos.bookName || ''} ${pos.chapter}`.trim();
    cont.dataset.state = 'continue';
    // Bygg DOM programmatisk (aldri innerHTML med lagrede verdier).
    cont.textContent = '';
    const left = document.createElement('div');
    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Fortsett å lese';
    const h2 = document.createElement('h2');
    h2.className = 'home-continue-title';
    h2.textContent = title;
    const sub = document.createElement('div');
    sub.className = 'home-continue-sub';
    sub.textContent = `Du stoppet ved vers ${pos.verse || 1}`;
    left.append(eyebrow, h2, sub);

    const actions = document.createElement('div');
    actions.className = 'home-actions';
    const primary = document.createElement('a');
    primary.className = 'home-btn home-btn-primary';
    primary.href = url;
    primary.textContent = `Fortsett ved vers ${pos.verse || 1}`;
    const next = document.createElement('a');
    next.className = 'home-btn home-btn-ghost';
    next.href = `/${pos.bookSlug}/${pos.chapter + 1}`;
    next.textContent = 'Neste kapittel';
    actions.append(primary, next);

    cont.append(left, actions);
  }
}
