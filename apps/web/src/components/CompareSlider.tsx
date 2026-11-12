'use client';
// Before and after on one frame, after InvokeAI's ImageComparisonSlider: the result fills the frame and the original shows left of a handle.
// A range input under the whole frame moves the handle, so a drag, a click, the arrow keys and Home/End all work and a screen reader reads the position.
import { type CSSProperties, useState } from 'react';

export function CompareSlider({ before, after, beforeAlt, afterAlt }: { before: string; after: string; beforeAlt: string; afterAlt: string }) {
  const [at, setAt] = useState(50);
  return (
    <div className="compare" style={{ '--at': `${at}%` } as CSSProperties}>
      <img className="compare-after" src={after} alt={afterAlt} />
      <img className="compare-before" src={before} alt={beforeAlt} />
      <span className="compare-tag compare-tag-before" aria-hidden="true">
        Trước
      </span>
      <span className="compare-tag compare-tag-after" aria-hidden="true">
        Sau
      </span>
      <span className="compare-handle" aria-hidden="true" />
      <input type="range" min={0} max={100} value={at} aria-label="So sánh trước và sau" aria-valuetext={`Ảnh gốc ${at}%, kết quả ${100 - at}%`} onChange={(e) => setAt(Number(e.target.value))} />
    </div>
  );
}
