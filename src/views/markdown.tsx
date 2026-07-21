// Markdown → hono/jsx (SSR), dep-fri — for innhold fra free-bible som er
// forfattet i markdown (bok-/kapittelsammendrag, historisk kontekst).
// Blokker: overskrifter (#–####), lister (-/*), avsnitt. Inline: **fet**,
// *kursiv*; all øvrig tekst går gjennom InlineRefs (klammer-refs + frie
// bibelreferanser). Samme dialekt som klient-rendereren i public/js/user.js.

import { InlineRefs } from './inline-refs.tsx';

const INLINE_RE = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

function Inline({ text }: { text: string }) {
  const parts: unknown[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) parts.push(<InlineRefs text={text.slice(last, m.index)} />);
    if (m[1]) {
      parts.push(
        <strong>
          <InlineRefs text={m[1]} />
        </strong>,
      );
    } else if (m[2]) {
      parts.push(
        <em>
          <InlineRefs text={m[2]} />
        </em>,
      );
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) parts.push(<InlineRefs text={text.slice(last)} />);
  return <>{parts}</>;
}

export function Markdown({ text }: { text: string }) {
  const lines = String(text || '').split('\n');
  const blocks: unknown[] = [];
  let list: string[] | null = null;

  const flushList = () => {
    if (list) {
      blocks.push(
        <ul>
          {list.map((item) => (
            <li>
              <Inline text={item} />
            </li>
          ))}
        </ul>,
      );
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const level = Math.min(6, h[1]!.length + 1);
      const content = <Inline text={h[2]!} />;
      blocks.push(
        level === 2 ? <h2>{content}</h2> : level === 3 ? <h3>{content}</h3> : level === 4 ? <h4>{content}</h4> : <h5>{content}</h5>,
      );
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      (list ??= []).push(li[1]!);
      continue;
    }
    flushList();
    if (line.trim() === '') continue;
    blocks.push(
      <p>
        <Inline text={line} />
      </p>,
    );
  }
  flushList();
  return <div class="md">{blocks}</div>;
}
