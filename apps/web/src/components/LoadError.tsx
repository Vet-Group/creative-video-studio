'use client';
import { useState } from 'react';

/** A read that failed, with a retry button beside it so a page reload is not needed. A retry that returns a promise keeps the button off until it settles. */
export function LoadError({ text, onRetry }: { text: string; onRetry: () => unknown }) {
  const [busy, setBusy] = useState(false);
  const retry = () => {
    const p = onRetry();
    if (p instanceof Promise) {
      setBusy(true);
      const done = () => setBusy(false);
      void p.then(done, done);
    }
  };
  return (
    <p className="error" role="alert">
      {text}{' '}
      <button type="button" className="link-button" disabled={busy} onClick={retry}>
        Thử lại
      </button>
    </p>
  );
}
