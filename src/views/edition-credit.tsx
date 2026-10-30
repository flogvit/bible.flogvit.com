// The credit a licence asks for, wherever the text is shown (#200): a CC BY or
// CC BY-SA text must carry its credit and licence notice under the text itself,
// not only on the edition's own page. The words come from free-bible's
// license.json (`statement`), never from here, so the credit cannot drift from
// the licence it answers to. A public domain text asks for nothing, and gets
// nothing.

import { getBibleEditionById } from '../lib/bible.ts';
import { lhref, tCtx } from '../lib/i18n.ts';

export async function EditionCredit({ id }: { id: string }) {
  const edition = await getBibleEditionById(id);
  const licence = edition?.license;
  if (!edition || !licence?.attribution_required) return <></>;
  const t = tCtx();
  const label = edition.abbreviation || edition.name_native || id;
  return (
    <p class="edition-credit" data-edition-credit={id}>
      {/* The name is in the edition's own language and script (Tanach is
          «תנ"ך»): a screen reader must read it as such (WCAG 3.1.2). */}
      <a
        href={lhref(`/oversettelser/${id}`)}
        data-proper-names
        lang={edition.lang_iso639_1 ?? undefined}
        dir={edition.direction === 'rtl' ? 'rtl' : undefined}
      >
        {label}
      </a>
      {' · '}
      {t('ed.licenseRow')}: {licence.spdx ?? licence.license}
      {licence.statement ? (
        <>
          {' · '}
          <span lang="en">{licence.statement}</span>
        </>
      ) : null}
    </p>
  );
}
