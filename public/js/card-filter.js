// Generisk kort-filter for studie-listene (temaer/historier/tall/dager).
// Søk over [data-search] + valgfri kategoriknapp-rad ([data-card-catfilter]
// med data-value på hvert kort som [data-cat]). Uten JS: alt synlig.

const list = document.querySelector('[data-card-list]');
if (list) {
  const search = document.querySelector('[data-card-search]');
  const empty = document.querySelector('[data-card-empty]');
  // Kortene kan ligge rett i lista eller i grupper (.study-group på /dager).
  const cards = Array.from(list.querySelectorAll('[data-search]'));
  const groups = Array.from(list.querySelectorAll('.study-group'));
  let query = '';
  let cat = '';

  function apply() {
    let visible = 0;
    for (const card of cards) {
      const matchCat = !cat || card.dataset.cat === cat;
      const q = query.trim().toLowerCase();
      const matchQ = !q || (card.dataset.search || '').includes(q);
      const show = matchCat && matchQ;
      card.hidden = !show;
      if (show) visible++;
    }
    for (const group of groups) {
      group.hidden = !group.querySelector('[data-search]:not([hidden])');
    }
    if (empty) empty.hidden = visible !== 0;
  }

  if (search) {
    search.addEventListener('input', () => {
      query = search.value;
      apply();
    });
  }

  const catRow = document.querySelector('[data-card-catfilter]');
  if (catRow) {
    catRow.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        catRow.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        cat = btn.dataset.value || '';
        apply();
      });
    });
  }
}
