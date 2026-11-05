'use client';
// The sectioned prompt of Create and Marketing Studio: ① Hook, the first 0-2 s; ② Body, the page's own prompt box; ③ Ending, the
// last shot. Each section has its rule (in line with the suggestions' PRINCIPLES, core/suggest.ts) and its own AI suggestions; the templates menu fills all
// three, and free writing keeps the page's one box. The page composes the prompt (lib/marketing.ts); PromptPreview shows the English it sends.
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { MAX_ENDING, MAX_HOOK } from '@/lib/marketing';
import type { PromptTemplate } from '@/lib/prompt-starters';
import { confirmDialog } from './Confirm';
import { Icon } from './Icon';
import { PromptComposer } from './PromptComposer';
import s from './PromptComposer.module.css';
import { PromptTools } from './PromptTools';
import type { Ask } from './Suggestions';

export type PromptMode = 'sections' | 'free';
const MODES: [PromptMode, string][] = [
  ['sections', 'Theo phần'],
  ['free', 'Viết tự do'],
];

/** How the member writes the prompt on `page`, remembered per browser; the sections by default, and when storage is blocked. */
export function usePromptMode(page: string): [PromptMode, (m: PromptMode) => void] {
  const key = `cvs.prompt-mode.${page}`;
  const [mode, setMode] = useState<PromptMode>('sections');
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === 'free') setMode('free');
    } catch {}
  }, [key]);
  function choose(m: PromptMode) {
    setMode(m);
    try {
      localStorage.setItem(key, m);
    } catch {}
  }
  return [mode, choose];
}

/** One optional section's words: the library box that fills or picks them, the member's own text, and its AI request. */
interface Part {
  box: ReactNode;
  text: string;
  onText: (text: string) => void;
  ask: (() => Ask) | null;
  /** A line under the box: on Marketing Studio, that the own hook counts only while no hook is chosen. */
  hint?: string;
  /** More fields of the section (Ending: the end frame and the end text). */
  extra?: ReactNode;
}

interface Props {
  feature: 'video' | 'marketing';
  format?: 'advanced';
  mode: PromptMode;
  onMode: (mode: PromptMode) => void;
  hook: Part;
  ending: Part;
  /** The page has the end text box, which the Ending rule points to for words on the picture. */
  endText?: boolean;
  templates: PromptTemplate[];
  /** Fills the sections (in free writing, the one box) from a template; `filled` says whether that replaces words, which the member confirms first. */
  onTemplate: (template: PromptTemplate) => void;
  filled: boolean;
  onRun: () => void;
  /** The page's prompt box: ② Body, and the one box in free writing. */
  children: ReactNode;
}

export function PromptSections({ feature, format, mode, onMode, hook, ending, endText, templates, onTemplate, filled, onRun, children }: Props) {
  const name = useId();
  const hookId = useId();
  const endingId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  async function pick(t: PromptTemplate) {
    setOpen(false);
    if (filled && !(await confirmDialog({ title: `Thay prompt đang viết bằng mẫu "${t.name}"?`, confirmLabel: 'Thay' }))) return;
    onTemplate(t);
  }
  const part = (id: string, label: string, p: Part, max: number, aiLabel: string, placeholder: string) => (
    <>
      {p.box}
      {p.hint && <p className="help">{p.hint}</p>}
      <PromptComposer id={id} label={label} optional feature={feature} format={format} value={p.text} onChange={p.onText} maxLength={max} onRun={onRun} placeholder={placeholder} ask={p.ask} aiLabel={aiLabel} parts={['ai', 'translate']} starters={[]} />
    </>
  );
  return (
    <div className="prompt-sections">
      <div className="prompt-sections-head">
        <div className="segmented theme-choice" role="radiogroup" aria-label="Cách viết prompt">
          {MODES.map(([m, label]) => (
            <label key={m}>
              <input type="radio" name={name} value={m} checked={mode === m} onChange={() => onMode(m)} />
              {label}
            </label>
          ))}
        </div>
        <button ref={opener} type="button" className="link-button" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(!open)}>
          <Icon name="preset" size={12} />
          Mẫu prompt
        </button>
      </div>
      {open && (
        <div id={listId} className="prompt-templates" role="group" aria-label="Mẫu prompt" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false), opener.current?.focus())}>
          {templates.map((t) => (
            <button key={t.name} type="button" className={s.option} onClick={() => void pick(t)}>
              <span className={s.optionLabel}>{t.name}</span>
              <span lang="en">{t.body}</span>
            </button>
          ))}
        </div>
      )}
      {mode === 'free' ? (
        children
      ) : (
        <>
          <Section title="① Hook · 0–2 giây đầu" rule="Một hành động mạnh trong 2 giây đầu, vào thẳng sản phẩm, không chữ trên hình.">
            {part(hookId, 'Hook tự viết', hook, MAX_HOOK, 'Gợi ý hook', 'Ví dụ: The clip opens as the product drops into frame (nên viết bằng tiếng Anh)')}
          </Section>
          <Section title="② Diễn biến" rule="Một hành động chính, thì hiện tại, nói rõ ánh sáng và máy quay.">
            {children}
          </Section>
          <Section title="③ Kết · cảnh cuối" rule={`Một cảnh dừng rõ ràng: giơ sản phẩm, mỉm cười, cận chi tiết. ${endText ? 'Cần chữ thì dùng ô Chữ trên khung cuối.' : 'Không chữ trên hình.'}`}>
            {part(endingId, 'Cảnh kết', ending, MAX_ENDING, 'Gợi ý cảnh kết', 'Ví dụ: The clip ends with the model smiling at the camera')}
            {ending.extra}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, rule, children }: { title: string; rule: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="prompt-part" role="group" aria-labelledby={id}>
      <p id={id} className="prompt-part-title">
        {title}
      </p>
      {children}
      <p className="help prompt-part-rule">{rule}</p>
    </div>
  );
}

/**
 * The exact English prompt Run sends, one per hook variant (`labels` names them), folded: with Translate for a Vietnamese reading of the first and the
 * longest one's length against the model's `limit`, red past it (Run then waits with the reason on the page).
 */
export function PromptPreview({ feature, prompts, labels, limit }: { feature: string; prompts: string[]; labels?: (string | null)[]; limit?: number }) {
  const [open, setOpen] = useState(false);
  const longest = Math.max(0, ...prompts.map((p) => p.length));
  return (
    <details className="prompt-preview" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Xem prompt gửi đi (EN)</summary>
      {prompts.map((p, i) => (
        <p key={labels?.[i] ?? i} lang="en">
          {labels?.[i] && <strong lang="vi">{labels[i]}: </strong>}
          {p}
        </p>
      ))}
      {/* Only while open: the closed fold keeps the page to one Translate button, the prompt box's. */}
      {open && (
        <div className="prompt-preview-foot">
          <PromptTools feature={feature} value={prompts[0] ?? ''} onChange={() => undefined} onRun={() => false} parts={['translate']} />
          <span className="prompt-preview-count" data-over={(limit !== undefined && longest > limit) || undefined}>
            {longest}
            {limit !== undefined && `/${limit}`} ký tự
          </span>
        </div>
      )}
    </details>
  );
}
