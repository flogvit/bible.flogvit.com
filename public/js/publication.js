// Øy: rapportknappen på en katalogoppføring (#15, del 2).
//
// Rapportering krever INGEN konto — den som ser noe galt er som regel ikke
// innlogget, og et krav om konto ville gjort rapportering til noe bare våre
// egne kunne gjøre. Knappen teller opp et signal til den som reviewer; den
// skjuler ingenting av seg selv.
//
// Én rapport per side per besøk: knappen deaktiveres etter klikk, så et
// gjentatt trykk ikke ser ut som flere uavhengige rapporter.

import { readStrings } from './locale.js';

const t = readStrings(document.body);

const btn = document.querySelector('[data-report-publication]');
const status = document.querySelector('[data-report-status]');

if (btn) {
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const slug = btn.dataset.reportPublication;
      const res = await fetch(`/api/publications/report/${encodeURIComponent(slug)}`, { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      if (status) status.textContent = t('pub.reported');
      btn.hidden = true;
    } catch {
      if (status) status.textContent = t('pub.reportFailed');
      btn.disabled = false;
    }
  });
}
