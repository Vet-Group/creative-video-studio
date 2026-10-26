'use client';
// The Enhance pill of the prompt box (Create video, Image Generation), as on Fash: on by default; when on, the worker has an LLM rewrite the
// member's own prompt into a detailed brief before the model runs. The name stays put and aria-pressed carries the state.
import { Icon } from './Icon';

export const ENHANCE_HINT = 'Dùng AI viết lại mô tả của bạn chi tiết hơn để có kết quả tốt hơn';

export function EnhanceToggle({ on, disabled = false, onChange }: { on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="enhance" aria-pressed={on} aria-label="Cải thiện mô tả bằng AI" title={ENHANCE_HINT} disabled={disabled} onClick={() => onChange(!on)}>
      <Icon name="wand" size={12} />
      <span aria-hidden="true">{on ? 'Cải thiện: bật' : 'Cải thiện: tắt'}</span>
    </button>
  );
}
