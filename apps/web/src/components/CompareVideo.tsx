'use client';
// Before and after of one remade scene as two stacked videos: the original, seeked to the scene's start, shows left of a handle and the remade clip fills the rest.
// The remade clip drives the clock and the original follows it, holding its last frame at the scene's end while the clip runs on. A range input over the frame moves
// the handle, as in CompareSlider. The videos mount only when the member opens the view (a remake lists up to 6 scenes, each would load two). Nothing autoplays or
// loops, so prefers-reduced-motion needs no special case: the member starts it with the button.
import { type CSSProperties, useRef, useState } from 'react';

const DRIFT_SECONDS = 0.25; // how far the original may lag the clip before it is put back in step
const HOLD_BEFORE_END = 0.05; // the original holds this far before the scene's end, so the next scene's first frame never shows

type Scene = { before: string; after: string; start: number; end: number };

export function CompareVideo(scene: Scene) {
  const [open, setOpen] = useState(false);
  return (
    <div className="remake-compare">
      <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Ẩn so sánh' : 'So sánh trước/sau'}
      </button>
      {open && <CompareVideoView {...scene} />}
    </div>
  );
}

export function CompareVideoView({ before, after, start, end }: Scene) {
  const original = useRef<HTMLVideoElement>(null);
  const remade = useRef<HTMLVideoElement>(null);
  const [at, setAt] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const hold = Math.max(start, end - HOLD_BEFORE_END);
  // Puts the original where the clip's time maps to (never past the scene's end) and plays or pauses it with the clip.
  // shortcut: timeupdate fires about every 250 ms, so the original may run up to that far past the hold point before it is paused; use requestVideoFrameCallback if that ever shows.
  const follow = (seek: boolean) => {
    const o = original.current;
    const r = remade.current;
    if (!o || !r) return;
    const want = Math.min(start + r.currentTime, hold);
    // A seek on a video that is still loading or seeking aborts that load and freezes the frame, so only re-sync one that is ready.
    if (seek || (!o.seeking && o.readyState >= 3 && Math.abs(o.currentTime - want) > DRIFT_SECONDS)) o.currentTime = want;
    if (r.paused || want >= hold || o.currentTime >= hold) o.pause();
    else if (o.paused) void o.play().catch(() => {});
  };
  return (
    <>
      <div className="compare" style={{ '--at': `${at}%` } as CSSProperties}>
        <video
          ref={remade}
          className="compare-after"
          src={after}
          muted
          playsInline
          preload="metadata"
          aria-label="Clip đã làm lại"
          onPlay={() => {
            setPlaying(true);
            setFailed(false);
            follow(true);
          }}
          onPause={() => {
            setPlaying(false);
            original.current?.pause();
          }}
          onSeeked={() => follow(true)}
          onTimeUpdate={() => follow(false)}
        />
        <video ref={original} className="compare-before" src={`${before}#t=${start}`} muted playsInline preload="metadata" aria-label="Video gốc" />
        <span className="compare-tag compare-tag-before" aria-hidden="true">
          Trước
        </span>
        <span className="compare-tag compare-tag-after" aria-hidden="true">
          Sau
        </span>
        <span className="compare-handle" aria-hidden="true" />
        <input type="range" min={0} max={100} value={at} aria-label="So sánh trước và sau" aria-valuetext={`Video gốc ${at}%, kết quả ${100 - at}%`} onChange={(e) => setAt(Number(e.target.value))} />
      </div>
      <button type="button" className="link-button" onClick={() => (playing ? remade.current?.pause() : void remade.current?.play().catch(() => setFailed(true)))}>
        {playing ? 'Tạm dừng' : 'Phát so sánh'}
      </button>
      {failed && <span className="error">Không phát được video. Hãy thử lại.</span>}
    </>
  );
}
