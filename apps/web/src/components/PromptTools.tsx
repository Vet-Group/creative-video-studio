'use client';
// The prompt's two tools beside its label (or at the end of the Image Generation bar's prompt row): the recent list shows the member's last own words
// on this page, a click fills the box; the expand button opens a tall editor bound to the same text. Ctrl+Enter there runs, as in the box.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { runKey } from '@/lib/run-guard';
import { Icon } from './Icon';
import { useJobs } from './jobs';
import { Modal } from './Modal';

interface Props {
  feature: string;
  format?: 'advanced';
  value: string;
  onChange: (text: string) => void;
  maxLength?: number;
  /** Presses Run; false when Run is off (the editor then stays open). */
  onRun: () => boolean | void;
  /** Icon buttons for the Image Generation bar instead of links. */
  bare?: boolean;
}

export function PromptTools({ feature, format, value, onChange, maxLength, onRun, bare }: Props) {
  const { jobs } = useJobs();
  const [prompts, setPrompts] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const load = useCallback(
    () => void api<{ prompts: string[] }>(`/api/recent-prompts?feature=${feature}${format ? `&format=${format}` : ''}`).then((r) => setPrompts(r.prompts), () => undefined),
    [feature, format],
  );
  // Again whenever a new job shows in the tray, so the words of a Run just sent are there.
  const newest = jobs[0]?.id;
  useEffect(load, [load, newest]);

  return (
    <span className="prompt-tools">
      {prompts.length > 0 && (
        <span className="suggest" onKeyDown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), setOpen(false))}>
          <button type="button" className={bare ? 'icon-button' : 'suggest-button'} aria-expanded={open} aria-label="Prompt gần đây" title={bare ? 'Prompt gần đây' : undefined} onClick={() => (open || load(), setOpen(!open))}>
            {/* "Gần đây" beside the prompt's label, so a label with "(tuỳ chọn)" and both tools stay on one line. */}
            {bare ? <Icon name="clock" /> : 'Gần đây'}
          </button>
          {open && (
            <div className="suggestions" role="group" aria-label="Prompt gần đây">
              {prompts.map((p) => (
                <button key={p} type="button" className="suggestion" onClick={() => (onChange(p), setOpen(false))}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
      <button type="button" className={bare ? 'icon-button' : 'suggest-button'} aria-label={bare ? 'Mở rộng' : undefined} title={bare ? 'Mở rộng' : undefined} onClick={() => setEditing(true)}>
        {bare ? <Icon name="ratio" /> : 'Mở rộng'}
      </button>
      <Modal open={editing} onClose={() => setEditing(false)} label="Sửa prompt" className="choice-dialog prompt-editor">
        <h2>Sửa prompt</h2>
        <textarea aria-label="Prompt mở rộng" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onKeyDown={runKey(() => onRun() !== false && setEditing(false))} autoFocus />
        <p className="help">
          {value.length}
          {maxLength !== undefined && `/${maxLength}`}
        </p>
      </Modal>
    </span>
  );
}
