'use client';
// The one renderer of every About tab: a page from lib/about-content.ts, laid out like the reference site's About pages (a centred title and lead,
// then sections of eyebrow, heading and lead with cards, steps, before-and-after pairs, tables, ratio tiles, example prompts and a FAQ).
// `long` is the app pages' article style: plain headings, numbered steps and points without boxes.
import Link from 'next/link';
import type { AboutBlock, AboutCard, AboutPage } from '@/lib/about-content';
import { cardSample } from '@/lib/examples';
import { useSamples } from '@/lib/use-samples';
import { CardMedia } from './CardMedia';

/** A sample's loop or still; the empty stripes while it is not uploaded, so the slot keeps its place. */
function Media({ name }: { name: string }) {
  return (
    <span className="about-media">
      <CardMedia {...cardSample(useSamples(), name)} />
    </span>
  );
}

function Card({ card }: { card: AboutCard }) {
  return (
    <li>
      {card.media && <Media name={card.media} />}
      {card.tag && <span className="about-tag">{card.tag}</span>}
      <h4>{card.title}</h4>
      <p>
        {card.text}
        {card.link && (
          <>
            {' '}
            <Link href={card.link[1]}>{card.link[0]}</Link>.
          </>
        )}
      </p>
      {card.specs && (
        <ul className="about-specs">
          {card.specs.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Block({ block }: { block: AboutBlock }) {
  if (typeof block === 'string') return <p>{block}</p>;
  if ('cards' in block)
    return (
      <ul className="about-cards" data-cols={block.cols ?? 2}>
        {block.cards.map((c) => (
          <Card key={c.title} card={c} />
        ))}
      </ul>
    );
  if ('steps' in block)
    return (
      <ol className="about-steps">
        {block.steps.map((s, i) => (
          <li key={s.title}>
            {s.media && <Media name={s.media} />}
            <span>
              <span className="about-step-no">Bước {String(i + 1).padStart(2, '0')}</span>
              <strong>{s.title}</strong> {s.text}
            </span>
          </li>
        ))}
      </ol>
    );
  if ('pairs' in block)
    return (
      <div className="about-pairs">
        {block.pairs.map((pair) => (
          <div key={pair.join()} className="about-pair">
            {pair.map((name, i) => (
              <figure key={name}>
                <Media name={name} />
                <figcaption>{block.labels[i]}</figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    );
  if ('table' in block) {
    const [head, ...rows] = block.table;
    return (
      <div className="about-table">
        <table>
          <thead>
            <tr>
              {head!.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.join()}>
                {r.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if ('list' in block)
    return (
      <ul className="about-list">
        {block.list.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    );
  if ('links' in block)
    return (
      <ul className="about-list">
        {block.links.map(([label, href, text]) => (
          <li key={label}>
            <Link href={href}>{label}</Link> {text}
          </li>
        ))}
      </ul>
    );
  if ('ratios' in block)
    return (
      <ul className="about-ratios">
        {block.ratios.map(([ratio, text]) => (
          <li key={ratio}>
            <span className="about-ratio-shape" data-auto={ratio === 'auto' || undefined} style={ratio === 'auto' ? undefined : { aspectRatio: ratio.replace(':', ' / ') }} aria-hidden="true" />
            <strong>{ratio}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    );
  if ('example' in block)
    return (
      <figure className="about-example">
        {block.example.media && <Media name={block.example.media} />}
        <figcaption>
          <span className="about-tag">{block.example.label}</span>
          <q>{block.example.text}</q>
        </figcaption>
      </figure>
    );
  return (
    <div className="about-faq">
      {block.faq.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}

export function About({ page, long = false }: { page: AboutPage; long?: boolean }) {
  return (
    <article className={long ? 'about about-long' : 'about'}>
      <h2>{page.title}</h2>
      {page.lead && <p className="about-intro">{page.lead}</p>}
      {page.sections.map((s) => (
        <section key={s.title}>
          {s.kicker && <p className="about-kicker">{s.kicker}</p>}
          <h3>{s.title}</h3>
          {s.lead && <p className="about-lead">{s.lead}</p>}
          {s.blocks?.map((b, i) => <Block key={i} block={b} />)}
        </section>
      ))}
    </article>
  );
}
