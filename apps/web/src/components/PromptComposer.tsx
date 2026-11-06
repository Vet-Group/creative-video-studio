'use client';
// The one prompt field of every form (Create, Marketing Studio and its lines, Try On, the apps): the label with an Optional chip, a box that
// grows with the text, starter chips while it is empty, a toolbar (Enhance when the page has it, AI suggestions, recent words, the tall editor)
// and a meta row with the Ctrl+Enter hint while typing and the count, red near the model's limit.
import type { ReactNode } from 'react';
import type { ParamFormat } from '@/lib/marketing';
import { runKey } from '@/lib/run-guard';
import { type Starter, STARTERS } from '@/lib/prompt-starters';
import s from './PromptComposer.module.css';
import { type PromptPart, PromptTools } from './PromptTools';
import type { Ask } from './Suggestions';

/** The count turns red from this share of the limit. */
const NEAR = 0.9;

interface Props {
  id: string;
  label: string;
  optional?: boolean;
  feature: string;
  format?: ParamFormat;
  value: string;
  onChange: (text: string) => void;
  maxLength?: number;
  onRun: () => boolean | void;
  placeholder: string;
  /** Read-only with this placeholder (Create while a preset is in use). */
  disabled?: boolean;
  ask?: (() => Ask) | null;
  aiLabel?: string;
  parts?: readonly PromptPart[];
  /** The page's Enhance pill, first in the toolbar. */
  enhance?: ReactNode;
  /** Starter chips; the feature's own by default, none with an empty list. */
  starters?: Starter[];
  /** Left of the count instead of the Ctrl+Enter hint (Advanced's word count). */
  meta?: ReactNode;
  required?: boolean;
}

export function PromptComposer({ id, label, optional, feature, format, value, onChange, maxLength, onRun, placeholder, disabled, ask, aiLabel, parts, enhance, starters = STARTERS[feature] ?? [], meta, required }: Props) {
  const near = maxLength !== undefined && value.length >= maxLength * NEAR;
  return (
    <div className={`field ${s.composer}`}>
      <div className={s.head}>
        {/* The name keeps the optional note for screen readers; the eye gets the chip. */}
        <label htmlFor={id} className="field-label">
          {label}
          {optional && <span className="sr-only"> (tuỳ chọn)</span>}
        </label>
        {optional && (
          <span className={s.optional} aria-hidden="true">
            Tuỳ chọn
          </span>
        )}
      </div>
      <div className={`prompt-box ${s.box}`} data-disabled={disabled || undefined}>
        <textarea id={id} className={s.input} value={disabled ? '' : value} maxLength={maxLength} disabled={disabled} aria-required={required || undefined} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={runKey(() => void onRun())} />
        {/* One row that scrolls sideways, so the chips never stack and push the settings below out of reach. */}
        {!disabled && !value && starters.length > 0 && (
          <div className={s.starters} role="group" aria-label="Gợi ý nhanh">
            {starters.map((c) => (
              <button key={c.label} type="button" className={s.starter} title={c.text} onClick={() => onChange(c.text)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {!disabled && (
          <div className={s.toolbar}>
            {enhance}
            <PromptTools feature={feature} format={format} value={value} onChange={onChange} maxLength={maxLength} onRun={onRun} ask={ask} aiLabel={aiLabel} parts={parts} />
          </div>
        )}
      </div>
      {!disabled && (
        <div className={s.meta}>
          {meta ?? <span className={s.hint}>Ctrl+Enter để chạy</span>}
          {value && (
            <span className={`prompt-count ${s.count}`} data-near={near || undefined}>
              {value.length}
              {maxLength !== undefined && `/${maxLength}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
