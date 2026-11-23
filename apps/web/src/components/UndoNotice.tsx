'use client';

import { useEffect, useRef, useState } from 'react';

/** How long the undo button stays offered after a delete. */
export const UNDO_MS = 6000;

export interface UndoNote {
  /** Names the thing deleted, so a second delete starts a fresh notice. */
  key: string;
  text: string;
  undo: () => Promise<void>;
}

function UndoToast({ note, onClose }: { note: UndoNote; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [held, setHeld] = useState(false); // focus is on the button: the notice waits, so a keyboard user is not timed out
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (state === 'busy' || (held && state === 'idle')) return;
    const timer = setTimeout(() => close.current(), UNDO_MS);
    return () => clearTimeout(timer);
  }, [held, state]);

  async function undo() {
    setState('busy');
    try {
      await note.undo();
      close.current();
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="toast" onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
      <span>{state === 'failed' ? 'Không hoàn tác được.' : note.text}</span>
      {state !== 'failed' && (
        <button type="button" disabled={state === 'busy'} onClick={() => void undo()}>
          Hoàn tác
        </button>
      )}
    </div>
  );
}

/** A notice with an undo button, as a polite live region that exists before its text does, so a screen reader announces it; focus stays where it was. */
export function UndoNotice({ note, onClose }: { note: UndoNote | null; onClose: () => void }) {
  return (
    <div className="undo-notice" role="status">
      {note && <UndoToast key={note.key} note={note} onClose={onClose} />}
    </div>
  );
}
