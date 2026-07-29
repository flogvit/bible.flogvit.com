// Fotnoter — port av bibel/src/components/Footnotes.tsx.
// React-utgavens toggle-knapp er blitt <details>/<summary> slik at
// komponenten virker uten JS (progressiv forbedring er standard her).

import type { VerseFootnote } from '../lib/bible.ts';
import { tCtx, tEnum } from '../lib/i18n.ts';

export type { VerseFootnote as Footnote };

export interface FootnotesProps {
  footnotes: VerseFootnote[];
  defaultOpen?: boolean;
}

export function Footnotes({ footnotes, defaultOpen = false }: FootnotesProps) {
  if (footnotes.length === 0) return null;

  // `source` er en DELT IDENTIFIKATOR og står på norsk i free-bible uansett
  // språk (bevisst, se free-bible/CLAUDE.md). Den skal derfor oversettes ved
  // visning, ikke i dataene.
  const t = tCtx();
  const label = t('fn.count', { n: footnotes.length });

  return (
    <details class="footnotes" open={defaultOpen}>
      <summary class="footnotes-toggle" aria-label={label} title={label}>
        *
      </summary>
      <div class="footnotes-panel">
        {footnotes.map((fn) => (
          <div class="footnote">
            {fn.source && <span class="footnote-source">{tEnum(t, 'fn.', fn.source.toLowerCase())}</span>}
            <p>{fn.text}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
