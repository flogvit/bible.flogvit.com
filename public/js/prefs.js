// The family preferences cookie `fv-prefs` (portal/PREFS.md): read it, and
// write one key the way PREFS.md's write snippet does — the cookie on
// .flogvit.com, and konto when logged in (401 otherwise, and then nothing).
// Shared by the chrome (theme) and the Bible edition choice (#182).

export function readPrefs() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)fv-prefs=([^;]+)/);
    return m ? JSON.parse(decodeURIComponent(m[1])) : {};
  } catch {
    return {};
  }
}

export function setPref(key, value) {
  const p = readPrefs();
  p[key] = value;
  const v = encodeURIComponent(JSON.stringify(p));
  document.cookie =
    'fv-prefs=' + v + ';domain=.flogvit.com;path=/;max-age=31536000;samesite=lax' +
    (location.protocol === 'https:' ? ';secure' : '');
  fetch('https://flogvit.com/api/prefs', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf': window.__fvCsrf || '' },
    body: JSON.stringify({ prefs: { [key]: value } }),
  }).catch(() => {});
  return p;
}
