// Personliste-filter — port av PersonList-søk/filter til vanilla. Opererer på
// data-attributtene som SSR la på hvert kort (data-era, data-roles, data-name,
// data-search). Uten JS er hele lista synlig.

const list = document.getElementById('person-list');
if (list) {
  const search = document.getElementById('person-search');
  const count = document.getElementById('person-count');
  const empty = document.getElementById('person-empty');
  const cards = Array.from(list.querySelectorAll('.persons-card'));

  let selectedEra = '';
  let selectedRole = '';
  let query = '';

  function score(card) {
    if (selectedEra && card.dataset.era !== selectedEra) return -1;
    if (selectedRole && !card.dataset.roles.split(' ').includes(selectedRole)) return -1;
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    const name = card.dataset.name;
    const text = card.dataset.search;
    let s = 0;
    if (name === q) s += 100;
    else if (name.startsWith(q)) s += 50;
    else if (name.includes(q)) s += 30;
    for (const w of q.split(/\s+/)) {
      if (w.length < 2) continue;
      if (name.includes(w)) s += 20;
      if (text.includes(w)) s += 5;
    }
    return s > 0 ? s : -1;
  }

  function apply() {
    const scored = [];
    for (const card of cards) {
      const s = score(card);
      card.hidden = s < 0;
      if (s >= 0) scored.push([card, s]);
    }
    // Sortér etter score når det søkes (som gamle appen).
    if (query.trim()) {
      scored.sort((a, b) => b[1] - a[1]);
      for (const [card] of scored) list.appendChild(card);
    }
    const active = query.trim() || selectedEra || selectedRole;
    if (count) {
      count.hidden = !active;
      const n = scored.length;
      count.textContent = `${n} ${n === 1 ? 'person' : 'personer'} funnet`;
    }
    if (empty) empty.hidden = scored.length !== 0;
  }

  if (search) {
    search.addEventListener('input', () => {
      query = search.value;
      apply();
    });
  }

  document.querySelectorAll('.persons-filter-buttons').forEach((group) => {
    const kind = group.dataset.filter;
    group.querySelectorAll('.persons-filter-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.persons-filter-button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.dataset.value;
        if (kind === 'era') selectedEra = val;
        else selectedRole = val;
        apply();
      });
    });
  });
}
