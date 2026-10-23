'use client';
// A row of cards that scrolls natively with scroll-snap. Arrow buttons (desktop), arrow keys and mouse drag move it; touch swipes natively.
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from 'react';

const DRAG_START_PX = 6;

export function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; left: number; id: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  function step(dir: 1 | -1) {
    const t = track.current;
    const card = t?.firstElementChild as HTMLElement | null | undefined;
    if (t && card) t.scrollBy({ left: dir * (card.offsetWidth + 12), behavior: 'smooth' });
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    step(e.key === 'ArrowRight' ? 1 : -1);
  }
  function onPointerDown(e: PointerEvent<HTMLUListElement>) {
    if (e.pointerType === 'mouse' && e.button === 0) drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, id: e.pointerId, moved: false };
  }
  function onPointerMove(e: PointerEvent<HTMLUListElement>) {
    const d = drag.current;
    if (!d) return;
    if (e.buttons === 0) return onPointerUp(); // the button was released outside, so the drag is over
    if (!d.moved && Math.abs(e.clientX - d.x) < DRAG_START_PX) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(d.id); // only after a real drag, so a plain click still reaches the card
      setDragging(true);
    }
    e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
  }
  function onPointerUp() {
    drag.current = null;
    setDragging(false);
  }

  return (
    <div className="carousel" role="group" aria-roledescription="carousel" aria-label={label}>
      <button type="button" className="carousel-arrow" aria-label="Cuộn sang trái" onClick={() => step(-1)}>
        ‹
      </button>
      <ul
        ref={track}
        className={dragging ? 'carousel-track dragging' : 'carousel-track'}
        tabIndex={0}
        aria-label={label}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </ul>
      <button type="button" className="carousel-arrow" aria-label="Cuộn sang phải" onClick={() => step(1)}>
        ›
      </button>
    </div>
  );
}
