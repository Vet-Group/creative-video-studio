'use client';
// The one renderer of every About tab: a page from lib/about-content.ts (tools) or lib/about-apps.ts (apps), laid out like the reference site's About pages (a centred title and lead,
// then sections of eyebrow, heading and lead with cards, steps, before-and-after pairs, tables, ratio tiles, example prompts and a FAQ).
// `long` is the app pages' article style: plain headings, numbered steps and points without boxes.
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { type AboutBlock, type AboutCard, type AboutPage, type SpecModel, withLiveSpecs } from '@/lib/about-specs';
import { type AboutKey, aboutPath, updatedLabel } from '@/lib/about-updated';
import { relatedApps } from '@/lib/apps';
import { cardSample } from '@/lib/examples';
import { samplesPending, useSamples, versionedSample } from '@/lib/use-samples';
import { usePageUpdate } from './AboutUpdates';
import { CardMedia } from './CardMedia';
import { Icon } from './Icon';
import { useSmartRemakeEnabled } from './SmartRemakeGate';

/** A page's tutorial video with sound, as the reference site's How to Use clips: its poster under a large play button, then the native controls once
 * started; captions from `<name>.vtt` when uploaded (off by default, the clips burn them in). Nothing until its `<name>.mp4` sample is uploaded. */
export function Tutorial({ name, title }: { name: string; title: string }) {
  const have = useSamples();
  const { video, poster } = cardSample(have, name);
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  // While the sample list loads, the empty 16:9 box keeps the video's place, so the text below does not jump down when the video arrives.
  if (!video) return samplesPending() ? <figure className="about-video" aria-hidden="true" /> : null;
  const start = () => {
    setStarted(true);
    ref.current?.play().catch(() => {}); // a refused play leaves the controls to start it
    requestAnimationFrame(() => ref.current?.focus()); // the button goes: the keyboard carries on in the player
  };
  return (
    <figure className="about-video">
      <video ref={ref} src={versionedSample(video)} poster={poster ? versionedSample(poster) : undefined} controls={started} playsInline preload="none" aria-label={`Video hướng dẫn: ${title}`}>
        {have.has(`${name}.vtt`) && <track kind="captions" src={versionedSample(`/api/samples/${name}.vtt`)} srcLang="vi" label="Tiếng Việt" />}
      </video>
      {!started && (
        <button type="button" className="about-video-play" aria-label={`Phát video hướng dẫn: ${title}`} onClick={start}>
          <span>
            <Icon name="play" filled size={28} />
          </span>
        </button>
      )}
    </figure>
  );
}

/** Back to the form from the end of an About: every tool page names its form `<prefix>-panel-create` and, on a phone, that panel's tab `<prefix>-tab-create` (WorkTabs). */
function toForm() {
  const tab = document.querySelector<HTMLElement>('[role="tab"][id$="-tab-create"]');
  if (tab && tab.getClientRects().length > 0) tab.click(); // a phone: the form is a tab of its own
  requestAnimationFrame(() => {
    const panel = document.querySelector<HTMLElement>('[id$="-panel-create"]');
    if (!panel) return;
    panel.scrollIntoView({ block: 'start' });
    const shown = (el: HTMLElement) => el.getClientRects().length > 0 && !el.matches(':disabled') && !el.closest('.tool-hint, .tool-hint-chip');
    [...panel.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]):not([type="file"]), textarea, select')].find(shown)?.focus({ preventScroll: true });
  });
}

/** The end of every About: back to the form, and on an app's page a few apps to try next (lib/apps.ts relatedApps). */
function Start({ app }: { app?: string }) {
  const related = relatedApps(app ?? '', useSmartRemakeEnabled());
  const id = useId();
  return (
    <section className="about-start" aria-labelledby={id}>
      <h3 id={id}>Bắt đầu</h3>
      <p>Quay lại form để bắt đầu.</p>
      <button type="button" className="primary" onClick={toForm}>
        Mở form
      </button>
      {related.length > 0 && (
        <>
          <p className="about-start-more">Ứng dụng cùng nhóm</p>
          <ul>
            {related.map((a) => (
              <li key={a.slug}>
                <Link href={`/apps/${a.slug}`}>{a.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** A sample's loop or still; the empty stripes while it is not uploaded, so the slot keeps its place.
 * About clips play under reduced motion too (owner, 2026-11-02): they show what a result looks like, and a still poster hid that. */
function Media({ name }: { name: string }) {
  return (
    <span className="about-media">
      <CardMedia {...cardSample(useSamples(), name)} lazy />
    </span>
  );
}

function Card({ card }: { card: AboutCard }) {
  return (
    <li>
      {card.media && <Media name={card.media} />}
      {card.tag && (
        <span className="about-tag" data-tone={card.tag === 'Nên' ? 'do' : card.tag === 'Không nên' ? 'dont' : undefined}>
          {card.tag}
        </span>
      )}
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

function Block({ block, models }: { block: AboutBlock; models?: SpecModel[] }) {
  if (typeof block === 'string') return <p>{block}</p>;
  if ('cards' in block)
    return (
      <ul className="about-cards" data-cols={block.cols ?? 2}>
        {block.cards.map((c) => (
          <Card key={c.title} card={withLiveSpecs(c, models)} />
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
  if ('loop' in block)
    return (
      <span className="about-loop">
        <CardMedia {...cardSample(useSamples(), block.loop)} lazy />
      </span>
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
                  <td key={i} data-label={head![i]}>
                    {c}
                  </td>
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
      <ul className="about-ratios" data-count={block.ratios.length}>
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

/** `page` names a tool's page (ABOUT) and `app` an app's slug (APP_ABOUT); the page data (a large module) loads when the tab first opens.
 * `models`: the Create form's loaded model list, which family cards build their spec lines from. */
export function About({ page: key, app, long = false, models }: { page?: AboutKey; app?: string; long?: boolean; models?: SpecModel[] }) {
  // A tool page loads the tools' copy and an app page the apps' copy: each module is about half of the About text.
  const [page, setPage] = useState<AboutPage>();
  useEffect(() => {
    if (key) void import('@/lib/about-content').then((m) => setPage(m.ABOUT[key]));
    else if (app) void import('@/lib/about-apps').then((m) => setPage(m.APP_ABOUT[app]));
  }, [key, app]);
  const updated = usePageUpdate(aboutPath(key, app));
  if (!page) return null;
  return (
    <article className={long ? 'about about-long' : 'about'}>
      <h2>{page.title}</h2>
      {page.lead && <p className="about-intro">{page.lead}</p>}
      {updated && (
        <p className="about-updated">
          <Link href="/changelog">
            <Icon name="calendar" />
            {updatedLabel(updated)}
          </Link>
        </p>
      )}
      {page.video && <Tutorial name={page.video} title={page.title} />}
      {page.sections.map((s) => (
        <section key={s.title}>
          {s.kicker && <p className="about-kicker">{s.kicker}</p>}
          <h3>{s.title}</h3>
          {s.lead && <p className="about-lead">{s.lead}</p>}
          {s.blocks?.map((b, i) => <Block key={i} block={b} models={models} />)}
        </section>
      ))}
      <Start app={app} />
    </article>
  );
}
