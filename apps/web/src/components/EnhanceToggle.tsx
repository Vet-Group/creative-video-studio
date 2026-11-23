'use client';
// The Enhance pill of the prompt box (Create video, Image Generation), as on Fash: on by default; when on, the worker has an LLM rewrite the
// member's own prompt into a detailed brief before the model runs. Its name is the text it shows (WCAG 2.5.3 Label in Name), aria-pressed carries the
// state and the title says what it does.
import { Icon } from './Icon';

export const ENHANCE_HINT = 'Dùng AI viết lại mô tả của bạn chi tiết hơn để có kết quả tốt hơn';
/** Under the prompt preview (PromptPreview) while Enhance is on: the model gets the rewrite, not the text shown. */
export const ENHANCE_NOTE = 'Cải thiện đang bật: AI viết lại prompt này chi tiết hơn trước khi gửi cho mô hình.';

export function EnhanceToggle({ on, disabled = false, onChange }: { on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="enhance" aria-pressed={on} title={ENHANCE_HINT} disabled={disabled} onClick={() => onChange(!on)}>
      <Icon name="wand" size={12} />
      <span>{on ? 'Cải thiện: bật' : 'Cải thiện: tắt'}</span>
    </button>
  );
}
