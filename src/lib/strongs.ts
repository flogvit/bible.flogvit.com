// Strong's numbers in a translation's text (#202). kjv_strongs and
// rv_1909_strongs carry them inline, «God{H430} created{H1254}{(H8804)}{H853}»:
// H/G plus a number is the word's lexicon entry, and {(H8804)} is a grammatical
// tag, not a number. The number belongs to the WORD, so the stored text is kept
// clean (search, the MCP and the songs read it) and the numbers are kept per
// word, by the word's index in the text split on whitespace.

/** The numbers of one word: `i` is its index among the verse's whitespace-separated words. */
export interface StrongsWord {
  i: number;
  n: string[];
}

/** A marker in the source text: `{H430}` is a number, `{(H8804)}` a grammatical tag. */
export const STRONGS_MARK = /\{\(?[HG]\d+\)?\}/g;
const NUMBER = /^\{([HG]\d+)\}$/;

/**
 * Take the markers out of a verse and say which word each number belonged to.
 * A number standing on its own after a space joins the word before it.
 */
export function parseStrongs(raw: string): { text: string; strongs: StrongsWord[] | null } {
  if (!STRONGS_MARK.test(raw)) {
    STRONGS_MARK.lastIndex = 0;
    return { text: raw, strongs: null };
  }
  STRONGS_MARK.lastIndex = 0;
  const words: string[] = [];
  const strongs: StrongsWord[] = [];
  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const marks = token.match(STRONGS_MARK) ?? [];
    const word = token.replace(STRONGS_MARK, '');
    const numbers = marks.map((m) => NUMBER.exec(m)?.[1]).filter((n): n is string => !!n);
    if (word) words.push(word);
    if (!numbers.length || !words.length) continue;
    const i = words.length - 1;
    const last = strongs[strongs.length - 1];
    if (last && last.i === i) last.n.push(...numbers);
    else strongs.push({ i, n: numbers });
  }
  return { text: words.join(' '), strongs: strongs.length ? strongs : null };
}

export interface StrongsSegment {
  text: string;
  n?: string[];
}

/** The text as words and the gaps between them, the numbers on their words. */
export function strongsSegments(text: string, strongs: readonly StrongsWord[]): StrongsSegment[] {
  const byWord = new Map(strongs.map((s) => [s.i, s.n] as const));
  let index = -1;
  return text
    .split(/(\s+)/)
    .filter((part) => part !== '')
    .map((part) => {
      if (/^\s+$/.test(part)) return { text: part };
      index++;
      const n = byWord.get(index);
      return n ? { text: part, n } : { text: part };
    });
}
