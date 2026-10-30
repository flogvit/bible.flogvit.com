// The credit a licence asks for, on the edition's own page (/oversettelser/<id>)
// and nowhere else (#206): one short line on the page's language, with links —
// «Oversatt fra SBLGNT (CC BY 4.0) og Leningrad Codex». The sources, their links
// and their licences come from free-bible's license.json (`credits`).
//
// Not under the text: the owner's decision (2026-10-30) is that nothing about
// licence or credit stands on the chapter pages. CC BY 4.0 lets the credit be
// given "in any reasonable manner", and the edition page is where a reader looks
// for where a translation comes from. The licence's internal wording
// (`statement`) is shown nowhere.

import type { BibleEditionLicense, LicenceCredit } from '../lib/bible.ts';
import { tCtx } from '../lib/i18n.ts';

function Source({ credit }: { credit: LicenceCredit }) {
  return (
    <>
      <a href={credit.url} rel="noopener" data-proper-names>
        {credit.name}
      </a>
      {credit.license ? (
        <>
          {' ('}
          {credit.license_url ? <a href={credit.license_url} rel="noopener license">{credit.license}</a> : credit.license}
          {')'}
        </>
      ) : null}
    </>
  );
}

export function EditionCredit({ licence }: { licence: BibleEditionLicense }) {
  const credits = licence.credits ?? [];
  if (!credits.length) return <></>;
  const t = tCtx();
  const translated = credits.filter((c) => c.relation === 'translated_from');
  const shown = credits.filter((c) => c.relation === 'text');
  const list = (items: LicenceCredit[]) =>
    items.map((c, i) => (
      <>
        {i > 0 ? (i === items.length - 1 ? ` ${t('ed.creditAnd')} ` : ', ') : null}
        <Source credit={c} />
      </>
    ));
  return (
    <p class="edition-credit" data-edition-credit>
      {shown.length ? <>{t('ed.creditText')}: {list(shown)}</> : null}
      {shown.length && translated.length ? ' · ' : null}
      {translated.length ? <>{t('ed.creditTranslatedFrom')} {list(translated)}</> : null}
    </p>
  );
}
