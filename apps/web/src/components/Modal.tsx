'use client';
// A native modal dialog: the browser traps focus, closes on Esc and returns focus to the control that opened it.
import { type ReactNode, useEffect, useRef } from 'react';

export function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-label={label} onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {open && (
        <>
          <button type="button" className="modal-close" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
          {children}
        </>
      )}
    </dialog>
  );
}
