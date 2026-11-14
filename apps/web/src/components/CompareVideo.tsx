'use client';
// Before and after of one remade scene as two stacked videos: the original, seeked to the scene's start, shows left of a handle and the remade clip fills the rest.
// The remade clip drives the clock and the original follows it. A range input over the frame moves the handle, as in CompareSlider. Nothing autoplays or loops, so
// prefers-reduced-motion needs no special case: the member starts it with the button.
import { type CSSProperties, useRef, useState } from 'react';

const DRIFT_SECONDS = 0.25; // how far the original may lag the clip before it is put back in step

export function CompareVideo({ before, after, start }: { before: string; after: string; start: number }) {
  const original = useRef<HTMLVideoElement>(null);
  const remade = useRef<HTMLVideoElement>(null);
  const [at, setAt] = useState(50);
  const [playing, setPlaying] = useState(false);
  const align = () => {
    if (original.current && remade.current) original.current.currentTime = start + remade.current.currentTime;
  };
  return (
    <div className="remake-compare">
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
            align();
            void original.current?.play().catch(() => {});
          }}
          onPause={() => {
            setPlaying(false);
            original.current?.pause();
          }}
          onSeeked={align}
          onTimeUpdate={() => {
            if (original.current && remade.current && Math.abs(original.current.currentTime - start - remade.current.currentTime) > DRIFT_SECONDS) align();
          }}
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
      <button type="button" className="link-button" onClick={() => void (playing ? remade.current?.pause() : remade.current?.play())}>
        {playing ? 'Tạm dừng' : 'Phát so sánh'}
      </button>
    </div>
  );
}
