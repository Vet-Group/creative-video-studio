'use client';
// Create's camera angles as tiles: each shows its angle on a plain shirt in a small frame, so a seller sees the shot before picking it.
// The CSS plays an angle's move on hover, on keyboard focus and on a picked tile while the group is on screen (paused off screen here);
// under reduced motion nothing moves and the arrow in the frame's corner is the hint. Same checkboxes as the chips they replace.
import { useEffect, useRef } from 'react';
import { CAMERA_ANGLES } from '@/lib/camera-angles';
import { Icon, type IconName } from './Icon';

/** The arrow of each angle: its move at a glance, and the whole hint when motion is off. */
export const ANGLE_GLYPHS: Record<string, IconName> = { 'close-up': 'expand', wide: 'compress', orbit: 'orbit', 'top-down': 'arrowdown', low: 'arrowup', 'eye-level': 'eye' };

export function CameraTiles({ labelledBy, picked, lockedWhy, onToggle }: { labelledBy: string; picked: string[]; lockedWhy: (a: (typeof CAMERA_ANGLES)[number]) => string | null; onToggle: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const watch = new IntersectionObserver(([e]) => el.toggleAttribute('data-paused', !(e?.isIntersecting ?? true)));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  // Run makes the clips in the list's order, so a picked tile shows its clip's number in that order.
  const order = CAMERA_ANGLES.filter((a) => picked.includes(a.id)).map((a) => a.id);
  return (
    <div ref={ref} className="cam-tiles" role="group" aria-labelledby={labelledBy}>
      {CAMERA_ANGLES.map((a) => (
        <label key={a.id} className="cam-tile" data-move={a.id} title={lockedWhy(a) ?? undefined}>
          <input type="checkbox" checked={picked.includes(a.id)} disabled={lockedWhy(a) !== null} onChange={() => onToggle(a.id)} />
          <span className="cam-stage" aria-hidden="true">
            <span className="cam-world">
              <svg viewBox="0 0 64 48" focusable="false">
                <ellipse className="cam-floor" cx="32" cy="41" rx="13" ry="2.2" />
                <path className="cam-shirt" d="M26 11c1.5 2.3 3.6 3.4 6 3.4s4.5-1.1 6-3.4l8 4.5-3 6-3-1.5V37H24V20l-3 1.5-3-6z" />
                <rect className="cam-print" x="29" y="20" width="6" height="5" rx="1" />
              </svg>
            </span>
            <span className="cam-glyph">
              <Icon name={ANGLE_GLYPHS[a.id] ?? 'arrow'} size={12} />
            </span>
          </span>
          <span className="cam-name">{a.label}</span>
          {order.includes(a.id) && (
            <span className="cam-order" aria-hidden="true">
              {order.indexOf(a.id) + 1}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
