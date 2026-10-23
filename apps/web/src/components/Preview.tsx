'use client';
// A looping sample clip: the poster first, then a muted loop while it is on screen. See docs/UI-MOTION-PARITY.md ("Parity matrix").
// It plays only while visible and the tab is shown, never more than MAX_PLAYING at once; reduced motion or blocked autoplay keeps the poster with a play button;
// a broken source keeps a poster-sized placeholder.
import { useEffect, useId, useRef, useState } from 'react';
import { releaseSlot, requestSlot } from '@/lib/play-slots';
import { REDUCED_MOTION, useMediaQuery } from '@/lib/use-media-query';

type State = 'idle' | 'playing' | 'blocked' | 'error';

export function Preview({ src, poster, width, height, title, paused = false }: { src: string; poster: string; width: number; height: number; title: string; paused?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const reduced = useMediaQuery(REDUCED_MOTION);
  const [visible, setVisible] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [userPlay, setUserPlay] = useState(false); // the user pressed play, which also lifts reduced motion and blocked autoplay for this clip
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    if (!box.current) return;
    const watch = new IntersectionObserver(([e]) => setVisible(e?.isIntersecting ?? false), { threshold: 0.25 });
    watch.observe(box.current);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setTabHidden(document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const want = visible && !tabHidden && !paused && state !== 'error' && (!reduced || userPlay);
  useEffect(() => {
    const v = video.current;
    if (!v || !want) return;
    let live = true;
    requestSlot(id, () => {
      v.play().then(
        () => live && setState('playing'),
        (e: unknown) => {
          if (!live) return;
          releaseSlot(id);
          if (e instanceof DOMException && e.name === 'NotAllowedError') setState('blocked');
          else if (!(e instanceof DOMException && e.name === 'AbortError')) setState('error');
        },
      );
    });
    return () => {
      live = false;
      v.pause();
      releaseSlot(id);
      setState((s) => (s === 'playing' ? 'idle' : s));
    };
  }, [want, id, attempt]);

  const showPlay = state === 'blocked' || (reduced && !userPlay && state !== 'error');
  return (
    <div ref={box} className="preview" data-state={state} style={{ aspectRatio: `${width} / ${height}` }}>
      <video ref={video} muted loop playsInline preload="none" poster={poster} src={src} aria-label={title} hidden={state === 'error'} onError={() => setState('error')} />
      {state === 'error' && (
        <div className="preview-missing" role="img" aria-label={`${title}: không tải được video`}>
          Không tải được video mẫu
        </div>
      )}
      {showPlay && (
        <button
          type="button"
          className="preview-play"
          aria-label={`Phát ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            setUserPlay(true);
            setState('idle');
            setAttempt((n) => n + 1);
          }}
        >
          ▶
        </button>
      )}
    </div>
  );
}
