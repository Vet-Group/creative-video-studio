'use client';
// The app's one confirm, in place of window.confirm: a Modal with a cancel button and the action's own button, red for an action that destroys or locks something.
import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
}
type Ask = ConfirmOptions & { answer: (yes: boolean) => void };

let show: ((ask: Ask) => void) | null = null;

/** Asks the member and resolves true only on the confirm button; cancel, Esc and the backdrop resolve false. Without a ConfirmHost on the page it falls back to the browser's confirm. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(options.body ? `${options.title}\n${options.body}` : options.title));
  const open = show;
  return new Promise((resolve) => open({ ...options, answer: resolve }));
}

/** Rendered once, by the Shell, for every confirmDialog of the signed-in pages. */
export function ConfirmHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    show = setAsk;
    return () => {
      show = null;
    };
  }, []);
  // After the Modal's own effect has opened the dialog, which would otherwise focus its × first.
  useEffect(() => {
    if (ask) (ask.danger ? cancel : ok).current?.focus();
  }, [ask]);
  const close = (yes: boolean) => {
    ask?.answer(yes);
    setAsk(null);
  };
  return (
    <Modal open={ask !== null} onClose={() => close(false)} label={ask?.title ?? ''} className="confirm">
      {ask && (
        <>
          <h2>{ask.title}</h2>
          {ask.body && <p>{ask.body}</p>}
          <div className="actions">
            <button type="button" ref={cancel} onClick={() => close(false)}>
              Huỷ
            </button>
            <button type="button" ref={ok} className={ask.danger ? 'primary danger' : 'primary'} onClick={() => close(true)}>
              {ask.confirmLabel}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
