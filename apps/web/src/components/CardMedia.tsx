'use client';
// The picture of a card: the sample's muted loop when one is uploaded, as the reference site plays on its cards (docs/UI-MOTION-PARITY.md), else its still.
// The loop plays only while the card is on screen and the tab is shown; reduced motion keeps the poster unless `always` is set.
import { useEffect, useRef } from 'react';
import { cardSample } from '@/lib/examples';
import { REDUCED_MOTION, useMediaQuery } from '@/lib/use-media-query';
import { useSamples } from '@/lib/use-samples';

/** `always`: play under reduced motion too, as the reference site's Explore prompt grid does (checked 2026-10-26). */
export function LoopVideo({ src, poster, always = false }: { src: string; poster: string | null; always?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useMediaQuery(REDUCED_MOTION) && !always;
  useEffect(() => {
    const v = ref.current;
    if (!v || reduced) return;
    let seen = false;
    const sync = () => {
      if (seen && document.visibilityState === 'visible') v.play().catch(() => {}); // a refused autoplay leaves the poster
      else v.pause();
    };
    const watch = new IntersectionObserver(([e]) => {
      seen = e?.isIntersecting ?? false;
      sync();
    });
    watch.observe(v);
    document.addEventListener('visibilitychange', sync);
    return () => {
      watch.disconnect();
      document.removeEventListener('visibilitychange', sync);
      v.pause();
    };
  }, [reduced, src]); // a new src (another preset chosen) loads paused, so the watch starts again
  return <video ref={ref} src={src} poster={poster ?? undefined} muted loop playsInline preload="none" aria-hidden="true" />;
}

/** A card's loop, else its still, else the empty stripes. `cardSample` (lib/examples.ts) picks the sources. */
export function CardMedia({ video, poster, always }: { video: string | null; poster: string | null; always?: boolean }) {
  if (video) return <LoopVideo src={video} poster={poster} always={always} />;
  return poster ? <img src={poster} alt="" /> : <span className="banner-empty" aria-hidden="true" />;
}

/** An About tab's "real results" section, as on the live page: the listed sample loops that are uploaded, side by side; nothing when none is. */
export function AboutClips({ names, title }: { names: string[]; title: string }) {
  const have = useSamples();
  const shown = names.filter((n) => have.has(`${n}.mp4`));
  if (shown.length === 0) return null;
  return (
    <>
      <p className="about-kicker">Kết quả thực tế</p>
      <h3>{title}</h3>
      <div className="about-clips">
        {shown.map((n) => (
          <CardMedia key={n} {...cardSample(have, n)} />
        ))}
      </div>
    </>
  );
}
