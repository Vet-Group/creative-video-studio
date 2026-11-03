// AI suggestions (a feature Fash lacks): asks the worker for three options for Marketing Studio's brief or lines, a new hook or location, or any
// other tool's prompt, and fills the field with the one the member picks. It writes text only; nothing is generated or billed beyond the one LLM call.
import { useEffect, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { Icon } from './Icon';

const POLL_MS = 1_500;
/** A little past the server's 60 s expiry, so the last poll sees `failed` rather than giving up first. */
const GIVE_UP_MS = 65_000;
const UNAVAILABLE = 'Chưa lấy được gợi ý lúc này, hãy thử lại sau.';

export interface Ask {
  field: 'brief' | 'script' | 'hook' | 'location' | 'prompt';
  /** For a prompt: the page's feature, which the server maps to the tool's task. */
  feature?: string;
  format?: 'advanced';
  text: string;
  /** Left out (undefined) when none is chosen. */
  hook?: string;
  location?: string;
  /** For a brief: the characters the chosen model leaves for it. */
  room?: number;
}

/** One suggestion request at a time: `run` asks and polls; `options` or `error` hold the answer until `clear`. */
export function useSuggest() {
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const alive = useRef(true);
  // Set on every mount: Strict Mode mounts twice, and the first cleanup would otherwise leave the page looking unmounted.
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  async function run(ask: Ask) {
    setBusy(true);
    setError('');
    setOptions([]);
    try {
      const { id } = await api<{ id: string }>('/api/suggestions', sendJson('POST', ask));
      for (const until = Date.now() + GIVE_UP_MS; alive.current && Date.now() < until; ) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const state = await api<{ status: string; options: string[] }>(`/api/suggestions/${encodeURIComponent(id)}`);
        if (state.status === 'succeeded') return setOptions(state.options);
        if (state.status === 'failed') break;
      }
      setError(UNAVAILABLE);
    } catch (e) {
      setError(errorText(e, UNAVAILABLE));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return { busy, options, error, run, clear: () => (setOptions([]), setError('')) };
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
