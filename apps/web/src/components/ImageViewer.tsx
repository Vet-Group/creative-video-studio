'use client';
// A picture over the whole screen: double tap or pinch to zoom, drag to pan, swipe down to close, swipe or arrows to step, and a download button.
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { clampView, DOUBLE_TAP_SCALE, fitted, onPicture, type Point, swipeOutcome, type View, zoomAt } from '@/lib/viewer-gesture';
import { Icon } from './Icon';
import { Modal } from './Modal';

const REST: View = { s: 1, x: 0, y: 0 };
const MOVED_PX = 10; // less than this is a tap, not a drag
const DOUBLE_TAP_MS = 300;

/** A picture over the whole screen with a close button. Element full screen on a picture has no way out on an iPad, and an iPhone opened a new tab. `placeholder`, already loaded, stands in while `src` comes. `downloadId` is the asset the download button saves; `onPrev`/`onNext` show the step arrows. */
export function ImageViewer({ src, alt, placeholder, downloadId, onPrev, onNext, onClose }: { src: string; alt: string; placeholder?: string; downloadId?: string; onPrev?: () => void; onNext?: () => void; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const view = useRef<View>(REST);
  const pointers = useRef(new Map<number, Point>());
  // Where the drag began (position, time, the view then); `axis` locks once the finger has moved; `pinch` holds the two fingers' start distance and centre, and `pinched` stops the finger left after a pinch from counting as a tap.
  const drag = useRef<{ x: number; y: number; t: number; base: View; axis: 'x' | 'y' | null; pinch: { d: number; at: Point } | null; pinched: boolean }>({ x: 0, y: 0, t: 0, base: REST, axis: null, pinch: null, pinched: false });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const [download, setDownload] = useState<'' | 'busy' | 'failed'>('');

  const geometry = () => {
    const r = stage.current!.getBoundingClientRect();
    const box = { w: r.width, h: r.height };
    return { r, box, shown: fitted(box, { w: img.current!.naturalWidth, h: img.current!.naturalHeight }) };
  };
  const paint = (v: View, animate = false) => {
    const el = img.current!;
    el.style.transition = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'transform .2s' : 'none';
    el.style.transform = v.s === 1 && !v.x && !v.y ? '' : `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
  };
  const fade = (dy: number) => stage.current?.closest('dialog')?.style.setProperty('--viewer-fade', String(dy > 0 ? Math.max(1 - dy / 400, 0.2) : 1));
  const setView = (v: View, animate = false) => {
    view.current = v;
    paint(v, animate);
  };
  const centred = (clientX: number, clientY: number) => {
    const { r } = geometry();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  // A new picture starts unzoomed.
  useEffect(() => {
    setView(REST);
    fade(0);
    lastTap.current = null;
    setDownload('');
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.key === 'ArrowLeft' ? onPrev : e.key === 'ArrowRight' ? onNext : undefined;
      if (!step) return;
      e.preventDefault();
      step();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stage.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.current.values()];
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, base: view.current, axis: null, pinch: b ? { d: Math.hypot(b.x - a!.x, b.y - a!.y) || 1, at: centred((a!.x + b.x) / 2, (a!.y + b.y) / 2) } : null, pinched: !!b };
  };
  const move = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    const { box, shown } = geometry();
    const [a, b] = [...pointers.current.values()];
    if (d.pinch && b) {
      const now = centred((a!.x + b.x) / 2, (a!.y + b.y) / 2);
      const z = zoomAt(d.base, (d.base.s * Math.hypot(b.x - a!.x, b.y - a!.y)) / d.pinch.d, d.pinch.at, box, shown);
      setView(clampView({ s: z.s, x: z.x + now.x - d.pinch.at.x, y: z.y + now.y - d.pinch.at.y }, box, shown));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.base.s > 1) return setView(clampView({ s: d.base.s, x: d.base.x + dx, y: d.base.y + dy }, box, shown));
    if (d.pinched || e.pointerType === 'mouse') return; // a pinch's last finger or a mouse does not swipe
    if (!d.axis && Math.max(Math.abs(dx), Math.abs(dy)) > MOVED_PX) d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (d.axis === 'y') {
      paint({ s: 1, x: 0, y: Math.max(dy, 0) });
      fade(dy);
    } else if (d.axis === 'x' && (onPrev || onNext)) paint({ s: 1, x: dx, y: 0 });
  };
  const up = (e: PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const d = drag.current;
    if (pointers.current.size) {
      // One finger of a pinch lifted: the other carries on as a pan from where the picture is now.
      const [p] = [...pointers.current.values()];
      drag.current = { x: p!.x, y: p!.y, t: e.timeStamp, base: view.current, axis: null, pinch: null, pinched: true };
      fade(0);
      return paint(view.current, true); // drops a swipe's offset and fade the second finger interrupted
    }
    if (view.current.s > 1 && view.current.s < 1.05) setView(REST, true);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (e.type === 'pointercancel') return fade(0), paint(view.current, true);
    if (d.pinched) return fade(0), paint(view.current, true);
    if (d.base.s === 1 && (d.axis === 'x' || d.axis === 'y')) {
      const out = swipeOutcome(dx, dy, e.timeStamp - d.t, { prev: !!onPrev, next: !!onNext });
      fade(0);
      if (out === 'close') return onClose();
      if (out === 'prev') return onPrev?.();
      if (out === 'next') return onNext?.();
      return paint(REST, true);
    }
    if (Math.max(Math.abs(dx), Math.abs(dy)) > MOVED_PX) return;
    const { box, shown } = geometry();
    // A click of the mouse on the empty area round the picture closes it, as the backdrop did.
    if (e.pointerType === 'mouse' && !onPicture(centred(e.clientX, e.clientY), view.current, shown)) return onClose();
    // A tap: a second one close by and soon after zooms in about that point, or back out.
    const tap = lastTap.current;
    if (tap && e.timeStamp - tap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 30) {
      lastTap.current = null;
      setView(view.current.s > 1 ? REST : zoomAt(view.current, DOUBLE_TAP_SCALE, centred(e.clientX, e.clientY), box, shown), true);
    } else lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
  };

  const save = async () => {
    setDownload('busy');
    try {
      const a = document.createElement('a');
      a.href = (await api<{ downloadUrl: string }>(`/api/assets/${downloadId}`)).downloadUrl;
      document.body.append(a);
      a.click();
      a.remove();
      setDownload('');
    } catch {
      setDownload('failed');
    }
  };

  return (
    <Modal open onClose={onClose} label={alt} className="input-viewer image-viewer">
      <div ref={stage} className="image-viewer-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img key={src} ref={img} src={src} alt={alt} draggable={false} style={placeholder ? { background: `center / contain no-repeat url("${placeholder}")` } : undefined} />
      </div>
      {downloadId && (
        <button type="button" className="image-viewer-btn image-viewer-download" aria-label="Tải xuống" title="Tải xuống" disabled={download === 'busy'} aria-busy={download === 'busy'} onClick={() => void save()}>
          <Icon name="download" size={20} />
        </button>
      )}
      {/* Both arrows stay once either is given, disabled at an end, so focus is not dropped when the last picture is reached. */}
      {(onPrev || onNext) && (
        <>
          <button type="button" className="image-viewer-btn image-viewer-prev" aria-label="Ảnh trước" disabled={!onPrev} onClick={onPrev}>
            ‹
          </button>
          <button type="button" className="image-viewer-btn image-viewer-next" aria-label="Ảnh sau" disabled={!onNext} onClick={onNext}>
            ›
          </button>
        </>
      )}
      {download === 'failed' && (
        <p className="image-viewer-note" role="alert">
          Không tải xuống được.
        </p>
      )}
    </Modal>
  );
}
