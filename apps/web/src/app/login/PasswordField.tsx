import { type RefObject, useEffect, useRef } from 'react';
import { Icon } from '@/components/Icon';
import { NARROW, REDUCED_MOTION, useMediaQuery } from '@/lib/use-media-query';
import { useHydrated } from '@/lib/use-hydrated';
import { beam, halfAt, lightAt, type Point, SPREAD, W0 } from './beam';

export type RevealMode = 'pointer' | 'touch' | 'plain';

/** How this device reveals the password, from media queries only: a plain toggle under reduced motion, a fixed beam without hover, else a pointer flashlight. */
export function useRevealMode(): RevealMode {
  const reduced = useMediaQuery(REDUCED_MOTION);
  const touch = useMediaQuery('(hover: none)');
  return reduced ? 'plain' : touch ? 'touch' : 'pointer';
}

const centre = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The password input with its eye button. `mode` is 'off' while hidden; any other mode shows the input as text. */
export function PasswordField({
  id,
  value,
  onChange,
  mode,
  onToggle,
  mascot,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  mode: RevealMode | 'off';
  onToggle: () => void;
  mascot: RefObject<SVGGElement | null>;
}) {
  const hydrated = useHydrated();
  const narrow = useMediaQuery(NARROW);
  const input = useRef<HTMLInputElement>(null);
  const eye = useRef<HTMLButtonElement>(null);
  const light = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const pointer = useRef<Point | null>(null);

  useEffect(() => {
    if (mode !== 'pointer') {
      pointer.current = null;
      return;
    }
    let frame = 0;
    const draw = () => {
      frame = 0;
      const [i, e, l, t] = [input.current, eye.current, light.current, text.current];
      if (!i || !e || !l || !t) return;
      const field = i.getBoundingClientRect();
      const origin = centre(e.getBoundingClientRect());
      const aim = pointer.current ?? origin;
      // On the stacked (narrow) form the Email field and the submit button sit close above and below, so the beam stays as tall as the field.
      const b = beam(origin, aim, field.width, narrow ? field.height : Infinity);
      const half = halfAt(b, b.length);
      // Where the cone stops widening, as a share of the length; 100% when it never reaches the cap.
      const flat = Math.min(100, ((half - W0) / SPREAD / b.length) * 100);
      l.style.width = `${b.length}px`;
      l.style.height = `${2 * half}px`;
      l.style.clipPath = `polygon(0 calc(50% - ${W0}px), ${flat}% 0, 100% 0, 100% 100%, ${flat}% 100%, 0 calc(50% + ${W0}px))`;
      l.style.transform = `translate(${origin.x}px, ${origin.y - half}px) rotate(${b.angle}deg)`;
      t.style.transform = `translateX(${-i.scrollLeft}px)`;
      const y = field.top + field.height / 2;
      for (const span of t.children as HTMLCollectionOf<HTMLElement>) {
        const lit = lightAt(b, centre(span.getBoundingClientRect()).x, y);
        span.style.setProperty('--lit', lit.toFixed(2));
        span.dataset.lit = String(lit > 0.5);
      }
      const m = mascot.current;
      const body = m?.querySelector('.mascot-body');
      if (m && body) {
        const c = centre(body.getBoundingClientRect());
        m.style.setProperty('--lens-angle', `${(Math.atan2(aim.y - c.y, aim.x - c.x) * 180) / Math.PI}deg`);
        m.dataset.lit = String(lightAt(b, c.x, c.y) > 0.5);
      }
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(draw);
    };
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      schedule();
    };
    document.addEventListener('pointermove', move);
    // Capture also catches the input's own scroll, which moves the glyphs under the overlay.
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    draw();
    return () => {
      document.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
      mascot.current?.style.removeProperty('--lens-angle');
      mascot.current?.removeAttribute('data-lit');
    };
  }, [mode, value, mascot, narrow]);

  return (
    <div className="password-field">
      {mode === 'touch' && <div className="beam" data-fixed="true" aria-hidden="true" />}
      <input
        ref={input}
        id={id}
        type={mode === 'off' ? 'password' : 'text'}
        autoComplete="current-password"
        autoCapitalize="off"
        spellCheck={false}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {mode === 'pointer' && (
        <>
          <div className="password-reveal" aria-hidden="true">
            <div ref={text}>
              {Array.from(value, (c, k) => (
                <span key={k} data-lit="false">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="beam" ref={light} aria-hidden="true" />
        </>
      )}
      <button ref={eye} type="button" className="password-eye" aria-pressed={mode !== 'off'} aria-label="Hiện ký tự đã gõ" disabled={!hydrated} onClick={onToggle}>
        <Icon name="eye" size={18} />
      </button>
    </div>
  );
}
