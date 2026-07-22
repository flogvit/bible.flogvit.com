// Søkeside-øy: skjuler resultatseksjoner brukeren har slått av i
// innstillinger (bible-settings.searchResultTypes, samme nøkler som gamle
// appen). SSR viser alle typene; uten JS er alt synlig.

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const settings = readJSON('bible-settings') || {};
const types = settings.searchResultTypes || {};
document.querySelectorAll('[data-search-type]').forEach((el) => {
  if (types[el.dataset.searchType] === false) el.hidden = true;
});
