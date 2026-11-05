'use client';
// Marketing Studio's end of the clip: the end scene, the last shot described for the model (the prompt's closing sentence, lib/marketing.ts), and
// the end text, which the worker burns over the last 2 s at the bottom, middle or top (apps/worker/src/media.ts), never asked of the model.
import { useId } from 'react';
import { END_TEXT_POSITIONS, type EndTextPosition, MAX_END_TEXT, MAX_ENDING } from '@/lib/marketing';

const POSITION_LABEL: Record<EndTextPosition, string> = { bottom: 'Dưới', middle: 'Giữa', top: 'Trên' };

export function EndScene({ ending, onEnding, text, onText, position, onPosition }: { ending: string; onEnding: (v: string) => void; text: string; onText: (v: string) => void; position: EndTextPosition; onPosition: (p: EndTextPosition) => void }) {
  const endingId = useId();
  const textId = useId();
  const helpId = useId();
  const positionId = useId();
  return (
    <div className="end-scene">
      <div className="field">
        <label className="field-label" htmlFor={endingId}>
          Cảnh kết (tuỳ chọn)
        </label>
        <textarea id={endingId} rows={2} value={ending} maxLength={MAX_ENDING} placeholder="Ví dụ: người mẫu mỉm cười, giơ sản phẩm về phía máy quay" onChange={(e) => onEnding(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={textId}>
          Chữ trên khung cuối (tuỳ chọn)
        </label>
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
