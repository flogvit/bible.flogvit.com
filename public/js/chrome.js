// Familie-chromen: temabryter (portal/PREFS.md), lukk <details>-menyer ved
// klikk utenfor / Escape, og plattform-riktig snarveihint. Ren progressiv
// forbedring — alt i chromen fungerer uten denne fila.

// ---- prefs (holdes i takt med PREFS.md sitt skrive-snippet) ----

function readPrefs() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)fv-prefs=([^;]+)/);
    return m ? JSON.parse(decodeURIComponent(m[1])) : {};
  } catch {
    return {};
  }
}

function applyPrefs(p) {
  const d = document.documentElement;
  if (p.lang) d.lang = p.lang;
  if (p.theme === 'light' || p.theme === 'dark') d.dataset.fvTheme = p.theme;
  else delete d.dataset.fvTheme;
  reflectTheme();
}

function setPref(key, value) {
  const p = readPrefs();
  p[key] = value;
  const v = encodeURIComponent(JSON.stringify(p));
  document.cookie =
    'fv-prefs=' + v + ';domain=.flogvit.com;path=/;max-age=31536000;samesite=lax' +
    (location.protocol === 'https:' ? ';secure' : '');
  applyPrefs(p);
  // persistér til konto hvis innlogget (401 hvis ikke — da hopper vi over)
  fetch('https://flogvit.com/api/prefs', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf': window.__fvCsrf || '' },
    body: JSON.stringify({ prefs: { [key]: value } }),
  }).catch(() => {});
}

// ---- tema-UI ----

function currentTheme() {
  const t = readPrefs().theme;
  return t === 'light' || t === 'dark' ? t : 'system';
}

function reflectTheme() {
  const cur = currentTheme();
  document.querySelectorAll('#fv-theme .fvmenu-segBtn').forEach((b) => {
    const on = b.dataset.theme === cur;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

document.querySelectorAll('#fv-theme .fvmenu-segBtn').forEach((b) => {
  b.addEventListener('click', () => {
    setPref('theme', b.dataset.theme);
    reflectTheme();
  });
});

// Ikon-knappen veksler mellom lys/mørk med utgangspunkt i det som faktisk vises.
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const explicit = document.documentElement.dataset.fvTheme;
    const dark = explicit
      ? explicit === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setPref('theme', dark ? 'light' : 'dark');
    reflectTheme();
  });
}

reflectTheme();

// ---- details-menyer: lukk ved klikk utenfor og Escape ----

document.addEventListener('pointerdown', (e) => {
  document.querySelectorAll('details[open]').forEach((d) => {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
});

// Bare ett nedtrekk åpent om gangen.
document.querySelectorAll('.nav-dd > summary').forEach((s) => {
  s.addEventListener('click', () => {
    document.querySelectorAll('.nav-dd[open]').forEach((d) => {
      if (d !== s.parentElement) d.removeAttribute('open');
    });
  });
});

// ---- snarveihint ----

const kbd = document.getElementById('cmdk-kbd');
if (kbd && /Mac|iP(hone|ad|od)/.test(navigator.platform)) {
  kbd.textContent = '⌘ K';
}
