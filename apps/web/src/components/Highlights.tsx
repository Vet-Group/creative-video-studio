'use client';
// Review's highlights box: one to three short lines the creator talks about, composed into the prompt (reviewPrompt in lib/marketing.ts).
import { useId } from 'react';
import { MAX_HIGHLIGHT, MAX_HIGHLIGHTS } from '@/lib/marketing';
import { Icon } from './Icon';

export function Highlights({ lines, onChange }: { lines: string[]; onChange: (lines: string[]) => void }) {
  const labelId = useId();
  const helpId = useId();
  return (
    <div className="highlights" role="group" aria-labelledby={labelId} aria-describedby={helpId}>
      <span id={labelId} className="field-label">
        Điểm nổi bật
      </span>
      {lines.map((line, i) => (
        <div className="highlight-row" key={i}>
          <input type="text" value={line} maxLength={MAX_HIGHLIGHT} aria-label={`Điểm nổi bật ${i + 1}`} placeholder="Ví dụ: Vải mềm, không nhăn" onChange={(e) => onChange(lines.map((l, j) => (j === i ? e.target.value : l)))} />
          {lines.length > 1 && (
            <button type="button" className="highlight-remove" aria-label={`Xoá điểm nổi bật ${i + 1}`} title="Xoá" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
              <Icon name="x" />
            </button>
          )}
        </div>
      ))}
      {lines.length < MAX_HIGHLIGHTS && (
        <button type="button" className="highlight-add" onClick={() => onChange([...lines, ''])}>
          <Icon name="plus" size={12} />
          Thêm điểm nổi bật
        </button>
      )}
      <p id={helpId} className="help">
        Cần ít nhất 1 ý, tối đa {MAX_HIGHLIGHTS} ý, mỗi ý ngắn gọn (tối đa {MAX_HIGHLIGHT} ký tự). Người mẫu sẽ nói về các ý này.
      </p>
    </div>
  );
}
