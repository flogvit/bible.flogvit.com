// Søkeside-øy: skjuler resultatseksjoner brukeren har slått av i
// innstillinger (bible-settings.searchResultTypes, samme nøkler som gamle
// appen), og treff fra et kommentarverk leseren har slått av (#286).
// SSR viser alle typene; uten JS er alt synlig.

import { readJSON } from './store.js';
import { hideCommentariesTurnedOff } from './commentary-render.js';

const settings = readJSON('bible-settings') || {};
const types = settings.searchResultTypes || {};
document.querySelectorAll('[data-search-type]').forEach((el) => {
  if (types[el.dataset.searchType] === false) el.hidden = true;
});
hideCommentariesTurnedOff(settings);
