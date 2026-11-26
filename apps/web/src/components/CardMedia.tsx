'use client';
// The picture of a card: the sample's muted loop when one is uploaded, as the reference site plays on its cards (docs/UI-MOTION-PARITY.md), else its still.
// The loop plays only while the card is on screen and the tab is shown. Reduced motion does not stop it: the reference site plays its loops
// regardless, and the owner chose the same for every sample (2026-11-02).
import { useEffect, useRef, useState } from 'react';

/** `lazy`: a poster downloads at once even with preload="none", so a long grid fetched every still on open; a lazy card sets its poster only once it
 * comes within 800 px of view (also ahead of a horizontal row's scroll, where the browser supports scrollMargin). Only for a box with a fixed shape:
 * where the poster sets the height (a masonry), a late poster moves the layout. */
export function LoopVideo({ src, poster, lazy = false }: { src: string; poster: string | null; lazy?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(!lazy);
  useEffect(() => {
    const v = ref.current;
    if (near || !v) return;
    const watch = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: '800px', scrollMargin: '800px' });
    watch.observe(v);
    return () => watch.disconnect();
  }, [near]);
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
  return <video ref={ref} src={src} poster={(near && poster) || undefined} muted loop playsInline preload="none" aria-hidden="true" />;
}

/** A card's loop, else its still, else the empty stripes. `cardSample` (lib/examples.ts) picks the sources. */
export function CardMedia({ video, poster, lazy }: { video: string | null; poster: string | null; lazy?: boolean }) {
  if (video) return <LoopVideo src={video} poster={poster} lazy={lazy} />;
  return poster ? <img src={poster} alt="" loading="lazy" decoding="async" /> : <span className="banner-empty" aria-hidden="true" />;
}
