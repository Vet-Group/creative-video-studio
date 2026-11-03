'use client';
// The prompt's tools: AI suggestions (three options from the worker), the member's recent words on this page, and a tall editor bound to the same
// text, with an undo for the last pick. In the prompt composer they sit in the box's toolbar; in the Image Generation bar (`compact`) they are
// round icons beside the text, so the bar's foot keeps one row. Only one list is open at a time; Escape or a click outside closes it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { runKey } from '@/lib/run-guard';
import { Icon } from './Icon';
import { useJobs } from './jobs';
import { Modal } from './Modal';
import s from './PromptComposer.module.css';
import { type Ask, useSuggest } from './Suggestions';

export type PromptPart = 'ai' | 'recent' | 'expand';

interface Props {
  feature: string;
  format?: 'advanced';
  value: string;
  onChange: (text: string) => void;
  maxLength?: number;
  /** Presses Run; false when Run is off (the editor then stays open). */
  onRun: () => boolean | void;
  /** The AI request for this field; without it there is no AI button. */
  ask?: () => Ask;
  /** The AI button's name, e.g. the lines' own one on Advanced. */
  aiLabel?: string;
  parts?: readonly PromptPart[];
  /** Round icons for the Image Generation bar instead of the toolbar's labelled buttons. */
  compact?: boolean;
}

export function PromptTools({ feature, format, value, onChange, maxLength, onRun, ask, aiLabel = 'Gợi ý AI', parts = ['ai', 'recent', 'expand'], compact }: Props) {
  const { jobs } = useJobs();
  const ai = useSuggest();
  const [prompts, setPrompts] = useState<string[]>([]);
  const [open, setOpen] = useState<'ai' | 'recent' | null>(null);
  const [editing, setEditing] = useState(false);
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // An open list low in the form's scroll box would sit under Run: bring it into view, without moving the page when it already shows.
  useEffect(() => void (open && list.current?.scrollIntoView({ block: 'nearest' })), [open, ai.options.length]);
  const has = (p: PromptPart) => parts.includes(p);

  const load = useCallback(
    () => void api<{ prompts: string[] }>(`/api/recent-prompts?feature=${feature}${format ? `&format=${format}` : ''}`).then((r) => setPrompts(r.prompts), () => undefined),
    [feature, format],
  );
  // Again whenever a new job shows in the tray, so the words of a Run just sent are there.
  const newest = jobs[0]?.id;
  const wantsRecent = parts.includes('recent');
  useEffect(() => void (wantsRecent && load()), [load, newest, wantsRecent]);

  // Escape gives the focus back to the button that opened the list; a pick puts it in the prompt box beside the tools.
  const close = useCallback(() => {
    root.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus();
    setOpen(null);
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(null);
    // On the document too: Safari does not focus a clicked button, so the key may not pass through the tools.
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('pointerdown', away), document.removeEventListener('keydown', esc));
  }, [open, close]);

  const pick = (text: string) => {
    if (text !== value) setUndo({ before: value, after: text });
    onChange(text);
    setOpen(null);
    root.current?.closest('.prompt-box, .imagebar')?.querySelector('textarea')?.focus();
  };
  const suggest = () => ask && void ai.run(ask());
  const toggleAi = () => {
    if (open === 'ai') return setOpen(null);
    setOpen('ai');
    if (!ai.busy && ai.options.length === 0) suggest();
  };
  const btn = compact ? 'icon-button' : s.tool;
  const aiName = ai.busy ? 'Đang viết gợi ý…' : aiLabel;

  return (
    <span ref={root} className={compact ? `prompt-tools ${s.compact}` : s.tools} onKeyDown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), close())}>
      {has('ai') && ask && (
        <button type="button" className={`${btn} ${s.ai}`} aria-expanded={open === 'ai'} aria-label={compact ? aiName : undefined} title={compact ? aiName : undefined} onClick={toggleAi}>
          <Icon name="wand" size={13} />
          {!compact && aiName}
        </button>
      )}
      {has('recent') && prompts.length > 0 && (
        <button type="button" className={btn} aria-expanded={open === 'recent'} aria-label="Prompt gần đây" title={compact ? 'Prompt gần đây' : undefined} onClick={() => (open === 'recent' ? setOpen(null) : (load(), setOpen('recent')))}>
          <Icon name="clock" size={13} />
          {!compact && <span aria-hidden="true">Gần đây</span>}
        </button>
      )}
      {undo && value === undo.after && (
        <button type="button" className={btn} aria-label={compact ? 'Hoàn tác' : undefined} title={compact ? 'Hoàn tác' : undefined} onClick={() => (onChange(undo.before), setUndo(null))}>
          <Icon name="left" size={13} />
          {!compact && 'Hoàn tác'}
        </button>
      )}
      {has('expand') && (
        <>
          {!compact && <span className={s.spacer} />}
          <button type="button" className={compact ? btn : `${s.tool} ${s.iconTool}`} aria-label="Mở rộng" title="Mở rộng" onClick={() => setEditing(true)}>
            <Icon name="expand" size={13} />
          </button>
        </>
      )}

      {open === 'ai' && (
        <div ref={list} className={s.popover} role="group" aria-label={aiLabel} aria-busy={ai.busy}>
          <div className={s.popHead}>
            <span>{ai.busy ? 'AI đang viết 3 gợi ý…' : 'Bấm một gợi ý để dùng'}</span>
            {!ai.busy && (
              <button type="button" className={s.popAction} onClick={suggest}>
                Gợi ý khác
              </button>
            )}
          </div>
          {ai.busy && [0, 1, 2].map((i) => <span key={i} className={s.skeleton} />)}
          {ai.options.map((o) => (
            <button key={o} type="button" className={s.option} onClick={() => pick(o)}>
              {o}
            </button>
          ))}
          {ai.error && (
            <p className={s.error} role="alert">
              {ai.error}
            </p>
          )}
        </div>
      )}
      {open === 'recent' && (
        <div ref={list} className={s.popover} role="group" aria-label="Prompt gần đây">
          <div className={s.popHead}>
            <span>Prompt bạn đã dùng gần đây</span>
          </div>
          {prompts.map((p) => (
            <button key={p} type="button" className={s.option} onClick={() => pick(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} label="Sửa prompt" className="choice-dialog prompt-editor">
        <h2>Sửa prompt</h2>
        <textarea aria-label="Prompt mở rộng" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onKeyDown={runKey(() => onRun() !== false && setEditing(false))} autoFocus />
        <div className={s.editorFoot}>
          <span>
            <span className="help">
              {value.length}
              {maxLength !== undefined && `/${maxLength}`}
            </span>{' '}
            · Ctrl+Enter để chạy
          </span>
          <button type="button" className="primary" onClick={() => setEditing(false)}>
            Xong
          </button>
        </div>
      </Modal>
    </span>
  );
}
