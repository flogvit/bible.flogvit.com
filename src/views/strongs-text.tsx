// Verse text with Strong's numbers beside the words (#202). The number is a
// small raised mark after the word, before the word's trailing punctuation, so
// the text reads as it would without it; `data-strongs` carries it for scripts.

import { strongsSegments } from '../lib/strongs.ts';
import type { StrongsWord } from '../lib/strongs.ts';

const TRAILING_PUNCTUATION = /[\p{P}\p{S}]+$/u;

export function StrongsText({ text, strongs }: { text: string; strongs: readonly StrongsWord[] | null | undefined }) {
  if (!strongs?.length) return <>{text}</>;
  return (
    <>
      {strongsSegments(text, strongs).map((seg) => {
        if (!seg.n) return seg.text;
        const tail = TRAILING_PUNCTUATION.exec(seg.text)?.[0] ?? '';
        const word = tail ? seg.text.slice(0, -tail.length) : seg.text;
        return (
          <>
            {word}
            <sup class="strongs-num" data-strongs={seg.n.join(' ')}>{seg.n.join(' ')}</sup>
            {tail}
          </>
        );
      })}
    </>
  );
}
