'use client';
// A slow strip of the company's example results under Explore's greeting. Decorative: hidden from assistive tech, with nothing to focus.
// It pauses while off screen (here) and on hover (CSS); under reduced motion the CSS shows a still mosaic instead.
import { useEffect, useRef } from 'react';
import { thumbUrl } from '@/lib/api';

// shortcut: a few examples repeat to fill the row, so the loop has no gap; drop the padding once the company has this many.
const FILL = 10;

export function ExploreStrip({ ids }: { ids: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const watch = new IntersectionObserver(([e]) => el.toggleAttribute('data-paused', !(e?.isIntersecting ?? true)));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const set = Array.from({ length: Math.max(FILL, ids.length) }, (_, i) => ids[i % ids.length]!);
  return (
    <div ref={ref} className="explore-strip" aria-hidden="true">
      <ul className="explore-strip-track">
        {[...set, ...set].map((id, n) => (
          <li key={n} data-copy={n >= set.length ? '' : undefined}>
            <img src={thumbUrl(id)} alt="" loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
    </div>
  );
}
