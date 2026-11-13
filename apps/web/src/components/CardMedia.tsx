'use client';
// The picture of a card: the sample's muted loop when one is uploaded, as the reference site plays on its cards (docs/UI-MOTION-PARITY.md), else its still.
// The loop plays only while the card is on screen and the tab is shown. Reduced motion does not stop it: the reference site plays its loops
// regardless, and the owner chose the same for every sample (2026-11-02).
import { useEffect, useRef } from 'react';

export function LoopVideo({ src, poster }: { src: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let seen = false;
    const sync = () => {
      if (seen && document.visibilityState === 'visible') v.play().catch(() => {}); // a refused autoplay leaves the poster
      else v.pause();
    };
    const watch = new IntersectionObserver(([e]) => {
      seen = e?.isIntersecting ?? false;
      sync();
    }, { rootMargin: '200px' }); // starts a card just before it scrolls in, and nothing is fetched before that
    watch.observe(v);
    document.addEventListener('visibilitychange', sync);
    return () => {
      watch.disconnect();
      document.removeEventListener('visibilitychange', sync);
      v.pause();
    };
  }, [src]); // a new src (another preset chosen) loads paused, so the watch starts again
  return <video ref={ref} src={src} poster={poster ?? undefined} muted loop playsInline preload="none" aria-hidden="true" />;
}

/** A card's loop, else its still, else the empty stripes. `cardSample` (lib/examples.ts) picks the sources. */
export function CardMedia({ video, poster }: { video: string | null; poster: string | null }) {
  if (video) return <LoopVideo src={video} poster={poster} />;
  return poster ? <img src={poster} alt="" loading="lazy" decoding="async" /> : <span className="banner-empty" aria-hidden="true" />;
}
