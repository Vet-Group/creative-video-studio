'use client';
// A native modal dialog: the browser traps focus, closes on Esc and returns focus to the control that opened it.
import { type ReactNode, useEffect, useRef } from 'react';

export function Modal({ open, onClose, label, className, children }: { open: boolean; onClose: () => void; label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={className ? `modal ${className}` : 'modal'} aria-label={label} onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {open && (
        <>
          <button type="button" className="modal-close" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
          {/* The dialog itself has no padding, so a click whose target is the dialog is a click on the backdrop. */}
          <div className="modal-body">{children}</div>
        </>
      )}
    </dialog>
  );
}
