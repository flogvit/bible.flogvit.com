// «Send» på API-referansen (/api/docs, #114).
//
// Øya har ingen egen tekst: alt leseren ser står i SSR-en, og det eneste som
// skrives herfra er svaret — statuslinja og kroppen. Derfor trenger den heller
// ingen ordbok (#33): en referanse som viser hva `GET /api/chapter` FAKTISK
// svarer, viser tjenestens svar, ikke vårt grensesnitt.
//
// Forespørselen går til samme opphav som sida, med de cookiene nettleseren
// allerede har — så en innlogget leser ser sine egne notater, og en anonym ser
// 401-en som står i tabellen over knappen.

/** Nok til å se formen; et helt kapittel er 300 kB og hjelper ingen i en boks. */
const MAX_CHARS = 20000;

function pretty(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

for (const form of document.querySelectorAll('form[data-try]')) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const url = form.elements.url.value.trim();
    const method = (form.dataset.method || 'get').toUpperCase();
    const bodyField = form.elements.body;
    const status = form.querySelector('[data-status]');
    const out = form.querySelector('[data-out]');
    const button = form.querySelector('button');

    button.disabled = true;
    status.hidden = false;
    out.hidden = false;
    status.textContent = '…';
    out.textContent = '';

    try {
      const init = { method, headers: {} };
      if (bodyField && method !== 'GET') {
        init.body = bodyField.value;
        init.headers['content-type'] = 'application/json';
      }
      const res = await fetch(url, init);
      const text = await res.text();
      status.textContent = `${res.status} ${res.statusText}`;
      const shown = pretty(text);
      // Avkortingen SIES, med tegn framfor ord: en kropp som bare stopper ser
      // ut som et svar som stoppet.
      out.textContent = shown.length > MAX_CHARS ? `${shown.slice(0, MAX_CHARS)}\n…` : shown;
    } catch (error) {
      status.textContent = String(error);
    } finally {
      button.disabled = false;
    }
  });
}
