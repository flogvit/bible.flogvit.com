// Fotnoter — port av bibel/src/components/Footnotes.tsx.
// React-utgavens toggle-knapp er blitt <details>/<summary> slik at
// komponenten virker uten JS (progressiv forbedring er standard her).

import type { VerseFootnote } from '../lib/bible.ts';

export type { VerseFootnote as Footnote };

const sourceLabels: Record<string, string> = {
  rabbinsk: 'Rabbinsk',
  kabbalistisk: 'Kabbalistisk',
  lingvistisk: 'Lingvistisk',
  historisk: 'Historisk',
  arkeologisk: 'Arkeologisk',
  teologisk: 'Teologisk',
};

export interface FootnotesProps {
  footnotes: VerseFootnote[];
  defaultOpen?: boolean;
}

export function Footnotes({ footnotes, defaultOpen = false }: FootnotesProps) {
  if (footnotes.length === 0) return null;

  const label = `${footnotes.length} fotnoter`;

  return (
    <details class="footnotes" open={defaultOpen}>
      <summary class="footnotes-toggle" aria-label={label} title={label}>
        *
      </summary>
      <div class="footnotes-panel">
        {footnotes.map((fn) => (
          <div class="footnote">
            {fn.source && <span class="footnote-source">{sourceLabels[fn.source] || fn.source}</span>}
            <p>{fn.text}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
