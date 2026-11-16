// Renders text read by parseRich: paragraphs, lists, bold and links, as React elements (no HTML from the text is ever used).
import { Fragment } from 'react';
import { type Inline, parseRich } from '@/lib/rich-text';

const span = (s: Inline, i: number) =>
  s.kind === 'bold' ? (
    <strong key={i}>{s.text}</strong>
  ) : s.kind === 'link' ? (
    <a key={i} href={s.text} target="_blank" rel="noreferrer">
      {s.text}
    </a>
  ) : (
    <Fragment key={i}>{s.text}</Fragment>
  );

const lines = (ls: Inline[][]) =>
  ls.map((l, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {l.map(span)}
    </Fragment>
  ));

export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className ? `rich ${className}` : 'rich'}>
      {parseRich(text).map((b, i) => {
        if (b.kind === 'para') return <p key={i}>{lines(b.lines)}</p>;
        const items = b.items.map((it, j) => <li key={j}>{lines(it)}</li>);
        return b.ordered ? (
          <ol key={i} start={b.start}>
            {items}
          </ol>
        ) : (
          <ul key={i}>{items}</ul>
        );
      })}
    </div>
  );
}
