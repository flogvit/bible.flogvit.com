// JSON i localStorage, delt av øyene. Ingen side-effekter ved import.
//
// Skriv går gjennom `localStorage.setItem` slik den står ved KALLET — altså via
// plus.js' gate og sync.js' endringsfangst, som begge patcher den.

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Kvote full eller skrivesperret (gratisbruker, plus.js) — tilstanden
    // lever videre i minnet for denne sidevisningen.
  }
}
