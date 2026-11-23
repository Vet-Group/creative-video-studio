'use client';
// The one prompt field of every form (Create, Marketing Studio and its lines, Try On, the apps): the label with an Optional chip, a box that
// grows with the text, starter chips while it is empty, a toolbar (Enhance when the page has it, AI suggestions, recent words, the tall editor)
// and a meta row with the Ctrl+Enter hint while typing and the count, red near the model's limit. With 2 or more input images the box also holds one
// chip per image that puts its [ImageN] token in the words.
import { type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { thumbUrl } from '@/lib/api';
import { imageToken, insertImageToken } from '@/lib/image-refs';
import type { ParamFormat } from '@/lib/marketing';
import { runKey } from '@/lib/run-guard';
import { inSeason, type Starter, STARTERS } from '@/lib/prompt-starters';
import s from './PromptComposer.module.css';
import { type PromptPart, PromptTools } from './PromptTools';
import type { Ask } from './Suggestions';

/** The count turns red from this share of the limit. */
const NEAR = 0.9;

/**
 * The starter chips: folded to the first row, so they never push the settings below out of reach, with a "+N" chip that unfolds the rest into wrapped
 * rows; a sideways scroller hid them from anyone without Shift+wheel. The chips past the first row are hidden (not tabbable, not read) while folded.
 */
function Starters({ starters, onPick }: { starters: Starter[]; onPick: (text: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [past, setPast] = useState(0);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const fold = () => {
      const chips = [...el.children] as HTMLElement[];
      const top = chips[0]?.offsetTop ?? 0;
      let n = 0;
      for (const c of chips) {
        const below = !open && c.offsetTop > top + 1;
        c.toggleAttribute('data-past', below);
        if (below) n++;
      }
      el.style.maxHeight = open || !chips[0] ? '' : `${chips[0].offsetHeight}px`;
      setPast(n);
    };
    fold();
    // On the next frame: folding changes the list's size, which inside the observer's own callback would be a loop.
    let frame = 0;
    const ro = new ResizeObserver(() => (cancelAnimationFrame(frame), (frame = requestAnimationFrame(fold))));
    ro.observe(el);
    return () => (ro.disconnect(), cancelAnimationFrame(frame));
  }, [open, starters]);
  return (
    <div className={s.starters} role="group" aria-label="Gợi ý nhanh">
      <div ref={list} className={s.starterList} data-open={open || undefined}>
        {starters.map((c) => (
          <button key={c.label} type="button" className={s.starter} title={c.text} onClick={() => onPick(c.text)}>
            {c.label}
          </button>
        ))}
      </div>
      {(past > 0 || open) && (
        <button type="button" className={`${s.starter} ${s.more}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? (
            'Thu gọn'
          ) : (
            <>
              +{past}
              <span className="sr-only"> gợi ý nữa</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface Props {
  id: string;
  label: string;
  optional?: boolean;
  feature: string;
  format?: ParamFormat;
  value: string;
  onChange: (text: string) => void;
  maxLength?: number;
  onRun: () => boolean | string | void;
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
  /** The input images in the order the job sends them (the Nth is [ImageN], see lib/image-refs.ts): 2 or more show the chips that insert their tokens. */
  refs?: { id: string }[];
}

export function PromptComposer({ id, label, optional, feature, format, value, onChange, maxLength, onRun, placeholder, disabled, ask, aiLabel, parts, enhance, starters, meta, required, refs }: Props) {
  const near = maxLength !== undefined && value.length >= maxLength * NEAR;
  // One list per feature, so the chip row's layout effect does not run again on every render.
  const input = useRef<HTMLTextAreaElement>(null);
  const touched = useRef(false); // until the box has had focus its caret is not the member's: the token goes at the end
  const refsId = useId();
  /** Puts image `n`'s token at the caret (over the selection), and gives the caret back to the box right after it. */
  function addRef(n: number) {
    const el = input.current;
    if (!el) return;
    const at = touched.current ? [el.selectionStart, el.selectionEnd] : [value.length, value.length];
    const put = insertImageToken(value, n, at[0]!, at[1]!, maxLength);
    if (!put) return;
    touched.current = true;
    onChange(put.text);
    requestAnimationFrame(() => (el.focus(), el.setSelectionRange(put.caret, put.caret))); // after the render, which would move the caret to the end
  }
  const chips = useMemo(() => starters ?? inSeason(STARTERS[feature] ?? []), [starters, feature]);
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
        <textarea ref={input} id={id} className={s.input} value={disabled ? '' : value} maxLength={maxLength} disabled={disabled} aria-required={required || undefined} placeholder={placeholder} onFocus={() => (touched.current = true)} onChange={(e) => onChange(e.target.value)} onKeyDown={runKey(() => void onRun())} />
        {!disabled && !value && chips.length > 0 && <Starters starters={chips} onPick={onChange} />}
        {!disabled && refs && refs.length >= 2 && (
          <div className={s.refs} role="group" aria-labelledby={refsId}>
            <span id={refsId} className={s.refsLabel}>
              Chèn ảnh vào mô tả:
            </span>
            {refs.map((r, i) => (
              <button key={r.id} type="button" className={s.ref} disabled={insertImageToken(value, i + 1, value.length, value.length, maxLength) === null} title={`Chèn ${imageToken(i + 1)} vào mô tả`} aria-label={`Chèn ${imageToken(i + 1)} vào mô tả (Ảnh ${i + 1})`} onClick={() => addRef(i + 1)}>
                <img src={thumbUrl(r.id, 40)} alt="" width={20} height={20} />
                Ảnh {i + 1}
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
