// Øy for /bidra og /mine-bidrag. All synlig tekst kommer server-rendret via
// data-*-attributter (klient-JS har ingen i18n — se portal/I18N.md).

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------- /bidra ----------
const form = document.querySelector('[data-contrib-form]');
if (form) initForm(form);

function initForm(form) {
  const refList = form.querySelector('[data-ref-list]');
  const template = form.querySelector('[data-ref-template]');

  // Artikkel/bok-bytte: vis bare relevante target-felt.
  const kindRadios = form.querySelectorAll('input[name="kind"]');
  function currentKind() {
    const checked = form.querySelector('input[name="kind"]:checked');
    return checked ? checked.value : 'article_verse_refs';
  }
  function updateKindFields() {
    const kind = currentKind();
    form.querySelectorAll('[data-kind-fields]').forEach((el) => {
      el.hidden = el.dataset.kindFields !== kind;
    });
  }
  kindRadios.forEach((radio) => radio.addEventListener('change', updateKindFields));
  updateKindFields();

  // Credit-navn vises bare når credit er på.
  const credit = form.querySelector('[data-credit]');
  const creditNameRow = form.querySelector('[data-credit-name-row]');
  if (credit && creditNameRow) {
    credit.addEventListener('change', () => {
      creditNameRow.hidden = !credit.checked;
    });
  }

  function previewBible() {
    const context = form.querySelector('[data-context-translation]');
    return context && context.value === 'osnn' ? 'osnn' : 'osnb';
  }

  // Live-forhåndsvisning: slå opp referansen og vis versteksten. Uoppløst er
  // LOV (reviewer løser det) — meldingen er nøytral, ikke en feil.
  const previewCache = new Map();
  async function updatePreview(row) {
    const input = row.querySelector('[data-ref-raw]');
    const preview = row.querySelector('[data-ref-preview]');
    if (!input || !preview) return;
    const raw = input.value.trim();
    row.dataset.confirmed = '';
    if (!raw) {
      preview.hidden = true;
      return;
    }
    const key = raw + '|' + previewBible();
    let result = previewCache.get(key);
    if (result === undefined) {
      try {
        const res = await fetch(
          '/api/verses?ref=' + encodeURIComponent(raw) + '&bible=' + previewBible(),
        );
        result = res.ok ? await res.json() : null;
      } catch {
        result = null;
      }
      previewCache.set(key, result);
    }
    if (input.value.trim() !== raw) return; // utdatert svar
    if (Array.isArray(result) && result.length > 0) {
      const first = result[0];
      const more = result.length > 1 ? ' … +' + (result.length - 1) : '';
      preview.textContent =
        '«' + first.bookShortName + ' ' + first.verse.chapter + ',' + first.verse.verse + '» ' +
        first.verse.text + more;
      preview.classList.remove('contrib-preview-unparsed');
      row.dataset.confirmed = '1';
    } else {
      preview.textContent = form.dataset.msgUnparsed;
      preview.classList.add('contrib-preview-unparsed');
    }
    preview.hidden = false;
  }

  function wireRow(row) {
    const input = row.querySelector('[data-ref-raw]');
    if (input) input.addEventListener('input', debounce(() => updatePreview(row), 400));
    const remove = row.querySelector('[data-ref-remove]');
    if (remove) {
      remove.addEventListener('click', () => {
        if (refList.querySelectorAll('[data-ref-row]').length > 1) row.remove();
      });
    }
  }
  refList.querySelectorAll('[data-ref-row]').forEach(wireRow);
  const firstRow = refList.querySelector('[data-ref-row]');
  if (firstRow && firstRow.querySelector('[data-ref-raw]').value) updatePreview(firstRow);

  const addRef = form.querySelector('[data-add-ref]');
  if (addRef && template) {
    addRef.addEventListener('click', () => {
      const clone = template.content.cloneNode(true);
      refList.appendChild(clone);
      const row = refList.querySelector('[data-ref-row]:last-child');
      wireRow(row);
      row.querySelector('[data-ref-raw]').focus();
    });
  }

  const status = form.querySelector('[data-form-status]');
  function showStatus(message, isError) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('contrib-status-error', !!isError);
    status.hidden = false;
  }

  function value(selector) {
    const el = form.querySelector(selector);
    return el ? el.value.trim() : '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const target = {};
    const kind = currentKind();
    const doi = value('[data-target-doi]');
    const isbn = value('[data-target-isbn]');
    const url = value('[data-target-url]');
    const title = value('[data-target-title]');
    if (kind === 'article_verse_refs' && doi) target.doi = doi;
    if (kind === 'book_verse_refs' && isbn) target.isbn13 = isbn;
    if (url) target.url = url;
    if (title) {
      const freetext = { title };
      const authors = value('[data-target-authors]');
      if (authors) freetext.authors = authors.split(',').map((a) => a.trim()).filter(Boolean);
      const year = parseInt(value('[data-target-year]'), 10);
      if (year > 0) freetext.year = year;
      const journal = value('[data-target-journal]');
      if (journal) freetext.publisher_or_journal = journal;
      target.freetext = freetext;
    }
    if (Object.keys(target).length === 0) {
      showStatus(form.dataset.msgNeedTarget, true);
      return;
    }

    const refs = [];
    refList.querySelectorAll('[data-ref-row]').forEach((row) => {
      const raw = row.querySelector('[data-ref-raw]').value.trim();
      if (!raw) return;
      const ref = { raw, kind: row.querySelector('[data-ref-kind]').value };
      if (row.dataset.confirmed === '1') ref.confirmed = true;
      const where = {};
      const page = parseInt(row.querySelector('[data-ref-page]').value, 10);
      if (page > 0) where.page = page;
      const section = row.querySelector('[data-ref-section]').value.trim();
      if (section) where.chapter_or_section = section;
      const quote = row.querySelector('[data-ref-quote]').value.trim();
      if (quote) where.quote = quote;
      if (Object.keys(where).length) ref.where = where;
      refs.push(ref);
    });
    if (refs.length === 0) {
      showStatus(form.dataset.msgNeedRef, true);
      return;
    }

    const body = {
      kind,
      target,
      context_translation: value('[data-context-translation]'),
      refs,
    };
    const comment = value('[data-comment]');
    if (comment) body.comment = comment;
    if (credit && credit.checked) {
      body.credit = true;
      const name = value('[data-credit-name]');
      if (name) body.credit_name = name;
    }

    try {
      const res = await fetch('/api/contrib', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        form.querySelectorAll('fieldset, h2, p, div, label, button, template').forEach((el) => {
          if (!el.hasAttribute('data-form-status')) el.hidden = true;
        });
        showStatus(form.dataset.msgSent, false);
        const link = document.createElement('a');
        link.href = form.dataset.mineUrl;
        link.textContent = form.dataset.mineUrl.replace(/^.*\//, '→ ');
        // Lenken til Mine bidrag får sidenavnet fra menyen — hent teksten der.
        const nav = document.querySelector('a[href$="/mine-bidrag"]');
        if (nav) link.textContent = '→ ' + nav.textContent.trim();
        status.appendChild(document.createTextNode(' '));
        status.appendChild(link);
      } else {
        const data = await res.json().catch(() => null);
        showStatus(form.dataset.msgError + (data && data.error ? ' (' + data.error + ')' : ''), true);
      }
    } catch {
      showStatus(form.dataset.msgError, true);
    }
  });
}

// ---------- /mine-bidrag ----------
document.querySelectorAll('[data-respond-form]').forEach((box) => {
  const button = box.querySelector('[data-respond-send]');
  const textarea = box.querySelector('[data-respond-message]');
  if (!button || !textarea) return;
  button.addEventListener('click', async () => {
    const message = textarea.value.trim();
    if (!message) return;
    button.disabled = true;
    try {
      const res = await fetch('/api/contrib/' + box.dataset.id + '/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (res.ok) location.reload();
      else button.disabled = false;
    } catch {
      button.disabled = false;
    }
  });
});
