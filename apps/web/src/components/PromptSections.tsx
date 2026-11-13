'use client';
// The sectioned prompt of Create and Marketing Studio: ① Hook, the first 0-2 s; ② Body, the page's own prompt box; ③ Ending, the
// last shot. Each section has its rule (in line with the suggestions' PRINCIPLES, core/suggest.ts) and its own AI suggestions; the templates dialog fills all
// three (and lists the member's recent hooks and endings, which fill one section), and free writing keeps the page's one box. The page composes the prompt (lib/marketing.ts); PromptPreview shows the English it sends.
import { type ReactNode, useEffect, useId, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { cardSample } from '@/lib/examples';
import { MAX_ENDING, MAX_HOOK, type ParamFormat } from '@/lib/marketing';
import type { PromptTemplate } from '@/lib/prompt-starters';
import { useHydrated } from '@/lib/use-hydrated';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { reloadSamples, useSamples, versionedSample } from '@/lib/use-samples';
import { confirmDialog } from './Confirm';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { Preview } from './Preview';
import { PromptComposer } from './PromptComposer';
import s from './PromptComposer.module.css';
import { PromptTools } from './PromptTools';
import { type Ask, useSuggest } from './Suggestions';

export type PromptMode = 'sections' | 'free';
const MODES: [PromptMode, string][] = [
  ['sections', 'Theo phần'],
  ['free', 'Viết tự do'],
];

/** How the member writes the prompt on `page`, remembered per browser; the sections by default, and when storage is blocked. */
// `initial` forces the starting mode for this mount without reading or writing the stored preference: a page handed a
// ready free prompt (the analysis page's push-prompt) shows free mode for that visit only, leaving the remembered mode untouched.
export function usePromptMode(page: string, initial?: PromptMode): [PromptMode, (m: PromptMode) => void] {
  const key = `cvs.prompt-mode.${page}`;
  const [mode, setMode] = useState<PromptMode>(initial ?? 'sections');
  useEffect(() => {
    if (initial) return;
    try {
      if (localStorage.getItem(key) === 'free') setMode('free');
    } catch {}
  }, [key, initial]);
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
  format?: ParamFormat;
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

/** How many recent hooks, and as many endings, the templates dialog lists. */
const RECENT_MAX = 3;

export function PromptSections({ feature, format, mode, onMode, hook, ending, endText, templates, onTemplate, filled, onRun, children }: Props) {
  const name = useId();
  const hookId = useId();
  const endingId = useId();
  const [open, setOpen] = useState(false);
  /** The member's own last hooks and endings (GET /api/recent-prompts?field=), fetched each time the dialog opens; empty when there are none or the fetch fails. */
  const [recent, setRecent] = useState<{ hook: string[]; ending: string[] }>({ hook: [], ending: [] });
  const narrow = useMediaQuery(NARROW);
  const have = useSamples();
  /** A template editor (GET /api/presets says so) sees the clip upload on each card; a member never does. */
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    if (!open) return;
    void api<{ canEdit: boolean }>('/api/presets').then((r) => setCanEdit(r.canEdit), () => undefined);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setRecent({ hook: [], ending: [] });
    const url = (field: string) => `/api/recent-prompts?feature=${feature}${format ? `&format=${format}` : ''}&field=${field}`;
    for (const field of ['hook', 'ending'] as const) void api<{ prompts: string[] }>(url(field)).then((r) => setRecent((cur) => ({ ...cur, [field]: r.prompts.slice(0, RECENT_MAX) })), () => undefined);
  }, [open, feature, format]);
  async function pick(t: PromptTemplate) {
    setOpen(false);
    if (filled && !(await confirmDialog({ title: `Thay prompt đang viết bằng khung "${t.name}"?`, confirmLabel: 'Thay' }))) return;
    onTemplate(t);
  }
  /** A recent hook or ending fills only its own section, after the member confirms replacing words already there. */
  async function takeRecent(p: Part, words: string, what: string) {
    setOpen(false);
    if (p.text.trim() !== '' && p.text.trim() !== words && !(await confirmDialog({ title: `Thay ${what} đang viết bằng câu này?`, confirmLabel: 'Thay' }))) return;
    p.onText(words);
  }
  const part = (id: string, label: string, p: Part, max: number, aiLabel: string, placeholder: string) => (
    <>
      {p.box}
      {p.hint && <p className="help">{p.hint}</p>}
      <PromptComposer id={id} label={label} optional feature={feature} format={format} value={p.text} onChange={p.onText} maxLength={max} onRun={onRun} placeholder={placeholder} ask={p.ask} aiLabel={aiLabel} parts={['ai', 'translate']} starters={[]} />
    </>
  );
  const recents = mode === 'sections' ? ([['Hook', 'hook', hook, 'hook'], ['Kết', 'ending', ending, 'cảnh kết']] as const).filter(([, key]) => recent[key].length > 0) : [];
  const list = (
    <>
      <h2>Khung prompt</h2>
      <p className="modal-sub">Điền sẵn Hook · Diễn biến · Kết để bạn sửa tiếp.</p>
      <div className="choice-grid prompt-template-grid" role="group" aria-label="Khung prompt">
        {templates.map((t) => {
          const clip = cardSample(have, `template-${t.id}`);
          return (
            <div key={t.id} className="prompt-template">
              {clip.video && <Preview src={versionedSample(clip.video)} poster={clip.poster ? versionedSample(clip.poster) : ''} width={3} height={4} title={`Clip mẫu ${t.name}`} onHover />}
              <button type="button" onClick={() => void pick(t)}>
                <span className="choice-name">{t.name}</span>
                <span className="choice-desc">{t.desc}</span>
                {t.needs && <span className="prompt-template-needs">{t.needs}</span>}
                {/* Create's dialog has room for what the template opens and ends on; Marketing Studio's, taller, keeps the one line. */}
                {feature === 'video' && (
                  <>
                    <span className="prompt-template-line">
                      Hook: <span lang="en">{t.hook}</span>
                    </span>
                    <span className="prompt-template-line">
                      Kết: <span lang="en">{t.ending}</span>
                    </span>
                  </>
                )}
              </button>
              {canEdit && <TemplateClip id={t.id} has={clip.video !== null} />}
            </div>
          );
        })}
      </div>
      {recents.length > 0 && (
        <section className="prompt-recent" aria-label="Gần đây">
          <h3>Gần đây</h3>
          {recents.map(([label, key, p, what]) => (
            <div key={key} role="group" aria-label={`${label} gần đây`}>
              <p className="help">{label}</p>
              {recent[key].map((words) => (
                <button key={words} type="button" lang="en" onClick={() => void takeRecent(p, words, what)}>
                  {words}
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
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
        <button type="button" className="link-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="preset" size={12} />
          Khung prompt
        </button>
      </div>
      {/* On a phone the dialog is a bottom sheet over the sticky Run bar; on a computer, a card dialog like the hook picker. */}
      <Modal open={open} onClose={() => setOpen(false)} label="Khung prompt" className={narrow ? 'template-sheet' : 'choice-dialog'}>
        {list}
      </Modal>
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
          <Section title="③ Kết · cảnh cuối" rule={`Một cảnh dừng rõ ràng: giơ sản phẩm, mỉm cười, cận chi tiết. ${endText ? 'Cần chữ thì dùng ô Chữ trên khung cuối.' : 'Không chữ trên hình.'}`} after={ending.extra}>
            {part(endingId, 'Cảnh kết', ending, MAX_ENDING, 'Gợi ý cảnh kết', 'Ví dụ: The clip ends with the model smiling at the camera (nên viết bằng tiếng Anh)')}
          </Section>
        </>
      )}
    </div>
  );
}

/** A template editor's upload of the card's clip, `template-<id>.mp4`, the way PresetEditing uploads a preset's; the cards show it once the sample list is read again. */
function TemplateClip({ id, has }: { id: string; has: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/samples/template-${id}.mp4`, { method: 'PUT', body: file });
      reloadSamples();
    } catch (e) {
      setError(errorText(e, 'Không tải lên được clip mẫu, hãy thử lại.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="prompt-template-edit">
      <label className="link-button">
        <input type="file" accept="video/mp4" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target)} />
        {busy ? 'Đang tải lên…' : has ? 'Thay clip mẫu' : 'Tải clip mẫu'}
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The rule sits under the section's own text, above `after` (③'s end frame and end text). */
function Section({ title, rule, after, children }: { title: string; rule: string; after?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <div className="prompt-part" role="group" aria-labelledby={id}>
      <p id={id} className="prompt-part-title">
        {title}
      </p>
      {children}
      <p className="help prompt-part-rule">{rule}</p>
      {after}
    </div>
  );
}

/**
 * The exact English prompt Run sends, one per hook variant (`labels` names them): open on a computer, folded on a phone. The summary keeps the longest
 * one's length against the model's `limit`, red past it (Run then waits with the reason on the page); open, Translate gives a Vietnamese reading of the first.
 * The server renders it open, and until hydration CSS (data-ssr) shows it folded on a phone, so neither screen flashes the other's state on load.
 * `note` says what still changes after Run (Enhance's rewrite, a preset's text the member may not read). `check` (the page's model, audio, seconds and
 * format) adds the Check button, which reviews the first prompt; only a page whose prompt is the member's own passes it.
 */
export function PromptPreview({ feature, prompts, labels, limit, note, check }: { feature: string; prompts: string[]; labels?: (string | null)[]; limit?: number; note?: string; check?: Pick<Ask, 'model' | 'audio' | 'seconds' | 'format'> }) {
  const narrow = useMediaQuery(NARROW);
  const hydrated = useHydrated();
  const [toggled, setToggled] = useState<boolean | null>(null); // the person's own choice beats the screen's default
  const open = toggled ?? !narrow;
  const longest = Math.max(0, ...prompts.map((p) => p.length));
  return (
    <details className="prompt-preview" data-ssr={hydrated ? undefined : ''} open={open} onToggle={(e) => e.currentTarget.open !== open && setToggled(e.currentTarget.open)}>
      <summary>
        Xem prompt gửi đi (EN)
        <span className="prompt-preview-count" data-over={(limit !== undefined && longest > limit) || undefined}>
          {longest}
          {limit !== undefined && `/${limit}`} ký tự
        </span>
      </summary>
      {/* Set apart from the page's own words, so the text the model gets is never mistaken for help or the member's draft. */}
      <div className="prompt-final" role="group" aria-label="Bản cuối gửi cho mô hình">
        <span className="prompt-final-label" aria-hidden="true">
          Bản cuối gửi cho mô hình
        </span>
        {prompts.map((p, i) => (
          <p key={labels?.[i] ?? i} lang="en">
            {labels?.[i] && <strong lang="vi">{labels[i]}: </strong>}
            {p}
          </p>
        ))}
      </div>
      {note && <div className="help">{note}</div>}
      {/* Only while open: the closed fold keeps the page to one Translate button, the prompt box's. */}
      {open && (
        <div className="prompt-preview-foot">
          <PromptTools feature={feature} value={prompts[0] ?? ''} onChange={() => undefined} onRun={() => false} parts={['translate']} />
          {check && prompts[0]?.trim() && <PromptCheck key={prompts[0]} text={prompts[0]} ask={check} />}
        </div>
      )}
    </details>
  );
}

/** The Check button: an AI review of the composed prompt before the member pays for the clip, as issues with fixes. It never blocks Run, and keyed by the prompt, new words clear it. */
function PromptCheck({ text, ask }: { text: string; ask: Pick<Ask, 'model' | 'audio' | 'seconds' | 'format'> }) {
  const { busy, options, meanings, error, done, run } = useSuggest();
  return (
    <>
      <button type="button" className={s.tool} disabled={busy} onClick={() => void run({ ...ask, field: 'check', text })}>
        <Icon name="check" size={13} />
        {busy ? 'Đang kiểm tra…' : error ? 'Thử lại' : 'Kiểm tra'}
      </button>
      <div className="prompt-check" role="group" aria-label="Kết quả kiểm tra prompt" aria-live="polite" hidden={!(busy || done || error)}>
        {done && options.length === 0 && <p className="help">Prompt ổn, có thể chạy.</p>}
        {options.length > 0 && (
          <ul>
            {options.map((o, i) => (
              <li key={o}>
                <strong>{o}</strong>
                {meanings[i] && <span>Cách sửa: {meanings[i]}</span>}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
