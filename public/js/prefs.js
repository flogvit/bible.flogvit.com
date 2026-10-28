// The family preferences cookie `fv-prefs` (portal/PREFS.md): read it, and
// write one key the way PREFS.md's write snippet does — the cookie on
// .flogvit.com, and the account in konto when logged in.
// Shared by the chrome (theme) and the Bible edition choice (#182).

export function readPrefs() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)fv-prefs=([^;]+)/);
    return m ? JSON.parse(decodeURIComponent(m[1])) : {};
  } catch {
    return {};
  }
}

/**
 * konto's CSRF token for this session, which the server puts on the account
 * chip when the reader is logged in. Without it konto answers 403, and the
 * choice never reached the account (#182).
 */
function csrfToken() {
  return document.querySelector('.account-chip-in')?.dataset.csrf || '';
}

/**
 * Save one key on the account. Resolves when konto has answered (or at once
 * when nobody is logged in), so a caller that reloads can wait for it.
 * keepalive: the settings page is often left right after a choice.
 */
export function persistPref(key, value) {
  const csrf = csrfToken();
  if (!csrf) return Promise.resolve();
  return fetch('https://flogvit.com/api/prefs', {
    method: 'PUT',
    credentials: 'include',
    keepalive: true,
    headers: { 'content-type': 'application/json', 'x-csrf': csrf },
    body: JSON.stringify({ prefs: { [key]: value } }),
  }).then(
    () => {},
    () => {},
  );
}

/** Write one key to the cookie (and nothing else). Returns the prefs. */
export function writePrefCookie(key, value) {
  const p = readPrefs();
  p[key] = value;
  const v = encodeURIComponent(JSON.stringify(p));
  document.cookie =
    'fv-prefs=' + v + ';domain=.flogvit.com;path=/;max-age=31536000;samesite=lax' +
    (location.protocol === 'https:' ? ';secure' : '');
  return p;
}

/** Write one key to the cookie and the account. Returns the prefs. */
export function setPref(key, value) {
  const p = writePrefCookie(key, value);
  persistPref(key, value);
  return p;
}
