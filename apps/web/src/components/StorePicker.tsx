'use client';

// The store picker used wherever a store is chosen or filtered: a combobox that opens a searchable list. The stores the caller pins or an
// Admin assigns to them (theirs) lead the list under their own heading; a star on each row pins or unpins it when `onPin` is given. It
// follows the same select-only combobox pattern as Select: focus moves into the search box and aria-activedescendant names the highlighted row.
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { firstEnabled, moveActive } from '@/lib/listbox';
import { Icon, type IconName } from './Icon';

export interface StoreOption {
  id: string;
  name: string;
  mine?: boolean;
  pinned?: boolean;
  assigned?: boolean;
}

type Row = { kind: 'none' | 'store'; id: string; name: string; store?: StoreOption } | { kind: 'head'; id: string; name: string };
const MOVES = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

export function StorePicker({
  label,
  icon = 'store',
  heading,
  value,
  stores,
  noneLabel,
  onChange,
  onPin,
}: {
  label: string;
  icon?: IconName;
  heading: string;
  value: string;
  stores: StoreOption[];
  /** The label of a first option that selects no store (a "none" or "all stores" choice); omit to require a store. */
  noneLabel?: string;
  onChange: (id: string) => void;
  /** Pin or unpin a store for the caller; a star shows on each row when given. */
  onPin?: (id: string) => void;
}) {
  const uid = useId();
  const triggerId = `${uid}-trigger`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const q = query.trim().toLowerCase();
  const matched = q ? stores.filter((s) => s.name.toLowerCase().includes(q)) : stores;
  const mine = matched.filter((s) => s.mine);
  const rest = matched.filter((s) => !s.mine);
  const rows: Row[] = [];
  if (noneLabel !== undefined) rows.push({ kind: 'none', id: '', name: noneLabel });
  if (mine.length) {
    rows.push({ kind: 'head', id: '', name: 'Của bạn' });
    for (const s of mine) rows.push({ kind: 'store', id: s.id, name: s.name, store: s });
  }
  if (rest.length) {
    if (mine.length) rows.push({ kind: 'head', id: '', name: 'Cửa hàng khác' });
    for (const s of rest) rows.push({ kind: 'store', id: s.id, name: s.name, store: s });
  }
  const flags = rows.map((r) => r.kind === 'head');
  const selected = rows.findIndex((r) => r.kind !== 'head' && r.id === value);
  const current = stores.find((s) => s.id === value);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const li = open ? document.getElementById(optionId(active)) : null;
    const list = li?.parentElement;
    if (li && list) list.scrollTop = Math.min(li.offsetTop, Math.max(list.scrollTop, li.offsetTop + li.offsetHeight - list.clientHeight));
  }, [open, active, uid]);

  function openList() {
    setQuery('');
    setActive(selected >= 0 ? selected : Math.max(0, firstEnabled(flags)));
    setOpen(true);
  }
  function close(refocus = false) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }
  function pick(i: number) {
    const r = rows[i];
    if (!r || r.kind === 'head') return;
    onChange(r.id);
    close(true);
  }
  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') setOpen(false);
    else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if (MOVES.includes(e.key)) {
      e.preventDefault();
      setActive((a) => moveActive(e.key, Math.min(a, rows.length - 1), flags));
    }
  }
  function closeOnBlur(e: React.FocusEvent) {
    if (!e.currentTarget.closest('.store-picker')?.contains(e.relatedTarget as Node)) setOpen(false);
  }

  return (
    <div className="field">
      <label htmlFor={triggerId} className="field-label">
        {label}
      </label>
      <div className="store-picker" data-open={open}>
        <button ref={triggerRef} type="button" id={triggerId} className="select-trigger" data-value={value} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown} onBlur={closeOnBlur}>
          <Icon name={icon} />
          <span className="select-value">{current?.name ?? noneLabel ?? ''}</span>
          <Icon name={open ? 'up' : 'down'} />
        </button>
        {open && (
          <div className="store-pop" onMouseDown={(e) => e.preventDefault()}>
            <input ref={searchRef} type="search" className="store-search" placeholder="Tìm cửa hàng…" aria-label={heading} value={query} onChange={(e) => (setQuery(e.target.value), setActive(0))} onKeyDown={onKeyDown} onBlur={closeOnBlur} />
            {rows.length === 0 ? (
              <p className="store-empty">Không có cửa hàng khớp.</p>
            ) : (
              <ul role="listbox" id={listId} aria-label={label}>
                {rows.map((r, i) =>
                  r.kind === 'head' ? (
                    <li key={`h-${r.name}`} id={optionId(i)} role="presentation" className="store-head">
                      {r.name}
                    </li>
                  ) : (
                    <li key={r.id || 'none'} id={optionId(i)} role="option" data-value={r.id} aria-selected={i === selected} data-active={i === active} onClick={() => pick(i)} onMouseMove={() => setActive(i)}>
                      <span className="store-name">{r.name}</span>
                      {i === selected && <Icon name="check" />}
                      {onPin && r.store && (
                        <button type="button" className={`store-star${r.store.pinned ? ' on' : ''}`} aria-pressed={!!r.store.pinned} aria-label={r.store.pinned ? `Bỏ ghim ${r.name}` : `Ghim ${r.name}`} title={r.store.pinned ? 'Bỏ ghim' : 'Ghim để hiện đầu danh sách'} onMouseDown={(e) => e.preventDefault()} onClick={(e) => (e.stopPropagation(), onPin(r.id))}>
                          {r.store.pinned ? '★' : '☆'}
                        </button>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
