// AI suggestions (a feature Fash lacks): asks the worker for three options for Marketing Studio's brief or lines, a new hook or location, or any
// other tool's prompt, and fills the field with the one the member picks. It writes text only; nothing is generated or billed beyond the one LLM call.
import { useEffect, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import type { ParamFormat } from '@/lib/marketing';
import { Icon } from './Icon';

const POLL_MS = 1_500;
/** A little past the server's expiry (SUGGEST_EXPIRY_SECONDS), so the last poll sees `failed` rather than giving up first. */
const GIVE_UP_MS = 95_000;
const UNAVAILABLE = 'Chưa lấy được gợi ý lúc này, hãy thử lại sau.';

export interface Ask {
  field: 'brief' | 'script' | 'hook' | 'location' | 'ending' | 'prompt' | 'translate' | 'video' | 'scenes' | 'check';
  /** For `video` (a template editor): the motion preset whose saved clip is read. */
  preset?: string;
  /** For `scenes` (Smart Remake): the member's finished analysis and their product image; the options are the numbers of the scenes that show a product like it. */
  analysisId?: string;
  productAssetId?: string;
  /** For a prompt: the page's feature, which the server maps to the tool's task. */
  feature?: string;
  format?: ParamFormat;
  text: string;
  /** Left out (undefined) when none is chosen. */
  hook?: string;
  location?: string;
  /** For a sectioned prompt's hook or ending: its other sections, which the option must fit (the add form sends none). */
  rest?: string;
  /** For a brief: the characters the chosen model leaves for it. */
  room?: number;
  /** The page's chosen model, its audio switch and the clip's length, so the options are written for that model and fit the clip. */
  model?: string;
  audio?: boolean;
  seconds?: number;
}

/** One suggestion request at a time: `run` asks and polls; `options` (with their Vietnamese `meanings`, null where none) or `error` hold the answer until `clear`; `done` tells an empty answer from none yet. */
export function useSuggest() {
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [meanings, setMeanings] = useState<(string | null)[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const alive = useRef(true);
  // Set on every mount: Strict Mode mounts twice, and the first cleanup would otherwise leave the page looking unmounted.
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const seq = useRef(0);

  async function run(ask: Ask) {
    // Only the latest run speaks: an earlier one that ends late (for another product or video) changes nothing.
    const my = ++seq.current;
    const latest = () => alive.current && seq.current === my;
    setBusy(true);
    setError('');
    setOptions([]);
    setDone(false);
    try {
      const { id } = await api<{ id: string }>('/api/suggestions', sendJson('POST', ask));
      for (const until = Date.now() + GIVE_UP_MS; latest() && Date.now() < until; ) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const state = await api<{ status: string; options: string[]; meanings?: (string | null)[] }>(`/api/suggestions/${encodeURIComponent(id)}`);
        if (!latest()) return;
        if (state.status === 'succeeded') return (setMeanings(state.meanings ?? []), setOptions(state.options), setDone(true));
        if (state.status === 'failed') break;
      }
      if (latest()) setError(UNAVAILABLE);
    } catch (e) {
      if (latest()) setError(errorText(e, UNAVAILABLE));
    } finally {
      if (latest()) setBusy(false);
    }
  }
  return { busy, options, meanings, error, done, run, clear: () => (setOptions([]), setError(''), setDone(false)) };
}

/** Text that already reads as Vietnamese (any of its tone or vowel marks) needs no translation. */
export const isVietnamese = (text: string) => /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(text);

// shortcut: kept for the page's life only, so a reload asks again; store them server side if staff translate the same prompts often.
const translations = new Map<string, string>();

/** The Translate button's reading of `text`: one run per text, then the remembered answer, so asking again costs nothing. */
export function useTranslate(text: string) {
  const { busy, options, error, run } = useSuggest();
  const [asked, setAsked] = useState<string | null>(null);
  const fresh = asked === text ? options[0] : undefined;
  useEffect(() => void (asked && options[0] && translations.set(asked, options[0])), [asked, options]);
  return {
    vi: translations.get(text) ?? fresh,
    busy: busy && asked === text,
    error: asked === text ? error : '',
    translate: () => {
      if (translations.has(text) || (busy && asked === text)) return;
      setAsked(text);
      void run({ field: 'translate', text });
    },
  };
}

export function SuggestButton({ ask, label, onPick, disabled }: { ask: () => Ask; label: string; onPick: (text: string) => void; disabled?: boolean }) {
  const { busy, options, error, run, clear } = useSuggest();

  // The options open under the button, over the form, so the form's own layout does not move.
  return (
    <span className="suggest">
      <button type="button" className="suggest-button" disabled={busy || disabled} onClick={() => void run(ask())}>
        <Icon name="wand" size={12} />
        {busy ? 'Đang gợi ý…' : label}
      </button>
      {(options.length > 0 || error) && (
        <div className="suggestions" role="group" aria-label={label}>
          {options.map((o) => (
            <button key={o} type="button" className="suggestion" onClick={() => (onPick(o), clear())}>
              {o}
            </button>
          ))}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
