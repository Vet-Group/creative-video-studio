'use client';
// A still of a video at each scene, cut in the browser, for the analysis result (AnalyzeView) and RemakePanel's scene picker.
import type { Analysis } from '@cvs/core/analysis/breakdown';
import { type RefObject, useEffect, useState } from 'react';
import { frameTime } from './analyze';

const FRAME_WIDTH = 128; // twice the 64 px it shows at, for a sharp still on a dense screen
const FRAME_WAIT_MS = 10_000;

/** Resolves on the video's `done` event, rejects on its error or after FRAME_WAIT_MS; `go` starts the load or the seek. */
const videoEvent = (v: HTMLVideoElement, done: 'loadeddata' | 'seeked', go: () => void) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('video timeout')), FRAME_WAIT_MS);
    v.addEventListener(done, () => (clearTimeout(timer), resolve()), { once: true });
    v.addEventListener('error', () => (clearTimeout(timer), reject(new Error('video error'))), { once: true });
    go();
  });

/**
 * A still of the video at each scene: a detached same-origin video seeks to the scene and draws to a canvas, one scene at a time, once `box` scrolls into view.
 * An entry is undefined until its still is ready; null (no thumbnails at all) with no source or after any failure, so the page shows none.
 */
export function useFrames(src: string | undefined, shots: Analysis['shots'], box: RefObject<HTMLElement | null>): (string | undefined)[] | null {
  const [frames, setFrames] = useState<(string | undefined)[] | null>(src ? [] : null);
  const scenes = shots.map((s) => `${s.start}-${s.end}`).join();
  useEffect(() => {
    if (!src) return setFrames(null);
    setFrames([]);
    let stopped = false;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const run = async () => {
      try {
        await videoEvent(v, 'loadeddata', () => (v.src = src));
        const canvas = document.createElement('canvas');
        canvas.width = FRAME_WIDTH;
        canvas.height = Math.round((FRAME_WIDTH * v.videoHeight) / v.videoWidth);
        const out: string[] = [];
        for (const s of shots) {
          await videoEvent(v, 'seeked', () => (v.currentTime = frameTime(s.start, s.end)));
          if (stopped) return;
          canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
          out.push(canvas.toDataURL('image/jpeg', 0.7));
          setFrames([...out]);
        }
      } catch {
        if (!stopped) setFrames(null); // a clip that will not decode, or a canvas the browser refuses to read: no thumbnails, quietly
      }
    };
    const watch = box.current && typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((e) => e[0]?.isIntersecting && (watch?.disconnect(), void run())) : null;
    if (watch) watch.observe(box.current!);
    else void run();
    return () => {
      stopped = true;
      watch?.disconnect();
      v.removeAttribute('src'); // lets the browser drop the connection
      v.load();
    };
  }, [src, scenes]);
  return frames;
}
