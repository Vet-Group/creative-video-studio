// Marketing Studio suggestions (a feature Fash lacks): asks the worker for three options for the brief or the lines, and fills the field with
// the one the member picks. It writes text only; nothing is generated or billed beyond the one LLM call.
import { useEffect, useRef, useState } from 'react';
import { api, errorText, sendJson } from '@/lib/api';
import { Icon } from './Icon';

const POLL_MS = 1_500;
/** A little past the server's 60 s expiry, so the last poll sees `failed` rather than giving up first. */
const GIVE_UP_MS = 65_000;
const UNAVAILABLE = 'Chưa lấy được gợi ý lúc này, hãy thử lại sau.';

interface Ask {
  field: 'brief' | 'script' | 'hook' | 'location';
  format?: 'advanced';
  text: string;
  /** Left out (undefined) when none is chosen. */
  hook?: string;
  location?: string;
  /** For a brief: the characters the chosen model leaves for it. */
  room?: number;
}

export function SuggestButton({ ask, label, onPick, disabled }: { ask: () => Ask; label: string; onPick: (text: string) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const alive = useRef(true);
  // Set on every mount: Strict Mode mounts twice, and the first cleanup would otherwise leave the page looking unmounted.
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  async function suggest() {
    setBusy(true);
    setError('');
    setOptions([]);
    try {
      const { id } = await api<{ id: string }>('/api/suggestions', sendJson('POST', ask()));
      for (const until = Date.now() + GIVE_UP_MS; alive.current && Date.now() < until; ) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const run = await api<{ status: string; options: string[] }>(`/api/suggestions/${encodeURIComponent(id)}`);
        if (run.status === 'succeeded') return setOptions(run.options);
        if (run.status === 'failed') break;
      }
      setError(UNAVAILABLE);
    } catch (e) {
      setError(errorText(e, UNAVAILABLE));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // The options open under the button, over the form, so the form's own layout does not move.
  return (
    <span className="suggest">
      <button type="button" className="suggest-button" disabled={busy || disabled} onClick={() => void suggest()}>
        <Icon name="wand" size={12} />
        {busy ? 'Đang gợi ý…' : label}
      </button>
      {(options.length > 0 || error) && (
        <div className="suggestions" role="group" aria-label={label}>
          {options.map((o) => (
            <button key={o} type="button" className="suggestion" onClick={() => (onPick(o), setOptions([]))}>
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
