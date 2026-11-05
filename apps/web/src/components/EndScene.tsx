'use client';
// Marketing Studio's end text, which the worker burns over the clip's last 2 s at the bottom, middle or top (apps/worker/src/media.ts), never asked of
// the model. It sits in the prompt's Ending section (PromptSections.tsx), beside the last shot and the end frame.
import { useId } from 'react';
import { END_TEXT_POSITIONS, type EndTextPosition, MAX_END_TEXT } from '@/lib/marketing';

const POSITION_LABEL: Record<EndTextPosition, string> = { bottom: 'Dưới', middle: 'Giữa', top: 'Trên' };

export function EndScene({ text, onText, position, onPosition }: { text: string; onText: (v: string) => void; position: EndTextPosition; onPosition: (p: EndTextPosition) => void }) {
  const textId = useId();
  const helpId = useId();
  const positionId = useId();
  return (
    <div className="end-scene">
      <div className="field">
        {/* The name keeps the optional note for screen readers; the eye gets the pill, as on the prompt boxes. */}
        <div className="optional-head">
          <label className="field-label" htmlFor={textId}>
            Chữ trên khung cuối<span className="sr-only"> (tuỳ chọn)</span>
          </label>
          <span className="choice-optional" aria-hidden="true">
            Tuỳ chọn
          </span>
        </div>
        <input id={textId} type="text" value={text} maxLength={MAX_END_TEXT} placeholder="Ví dụ: Giảm 50% hôm nay" aria-describedby={helpId} onChange={(e) => onText(e.target.value)} />
        <p id={helpId} className="help">
          Chèn vào 2 giây cuối của video, không tốn thêm phí.
        </p>
        {text.trim() && (
          <div className="segmented theme-choice" role="radiogroup" aria-label="Vị trí chữ">
            {END_TEXT_POSITIONS.map((p) => (
              <label key={p}>
                <input type="radio" name={positionId} value={p} checked={position === p} onChange={() => onPosition(p)} />
                {POSITION_LABEL[p]}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
