// Statistikk: ordfane-bytting. Oversettelse er SSR-rendret; hebraisk/gresk
// hentes lazy fra API-et ved klikk (som gamle appen). Uten JS vises
// oversettelses-ordene.

import { readStrings } from './locale.js';

const t = readStrings(document.body);

/** Status-rad i ordlista (laster / feilet). Tekst via textContent, aldri innerHTML. */
function loadingRow(text) {
  const li = document.createElement('li');
  li.className = 'stat-word-loading';
  li.textContent = text;
  return li;
}

const tabs = document.querySelectorAll('.stat-word-tab');
const listEl = document.getElementById('stat-words');
if (tabs.length && listEl) {
  const bible = listEl.dataset.bible || 'osnb';
  // Behold SSR-oversettelseslista så vi slipper å hente den på nytt.
  const cache = { translation: listEl.innerHTML };

  function render(words) {
    listEl.innerHTML = words
      .map(
        (w) =>
          `<li class="stat-word-item"><span class="stat-word"></span><span class="stat-word-count"></span></li>`,
      )
      .join('');
    listEl.querySelectorAll('.stat-word-item').forEach((li, i) => {
      li.querySelector('.stat-word').textContent = words[i].word;
      li.querySelector('.stat-word-count').textContent = String(words[i].count).replace(
        /\B(?=(\d{3})+(?!\d))/g,
        ' ',
      );
    });
  }

  async function load(tab) {
    if (cache[tab]) {
      listEl.innerHTML = cache[tab];
      return;
    }
    const url =
      tab === 'translation'
        ? `/api/statistics/top-words?bible=${encodeURIComponent(bible)}&limit=100`
        : `/api/statistics/top-words/${tab}?limit=100`;
    listEl.textContent = '';
    listEl.appendChild(loadingRow(t('common.loading')));
    try {
      const res = await fetch(url);
      const data = await res.json();
      render(data.words || []);
      cache[tab] = listEl.innerHTML;
    } catch {
      listEl.textContent = '';
      listEl.appendChild(loadingRow(t('is.noWords')));
    }
  }

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      load(btn.dataset.wordtab);
    });
  });
}
