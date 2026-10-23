'use client';
// The model picker: a button that opens a floating panel beside it with a search box and the models in two groups.
// Focus moves to the search box, which drives the list through aria-activedescendant; Escape returns focus to the button.
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { firstEnabled, moveActive } from '@/lib/listbox';
import { Icon } from './Icon';

export interface ModelOption {
  id: string;
  label: string;
  isMock: boolean;
  supported: boolean;
  /** The pass rate as text; image models have none yet, so the row leaves it out. */
  rate?: string;
  estimateUsd: string;
}

const PANEL = { width: 334, height: 446, gap: 8 };

/** Supported models first, then the ones the current settings rule out; the search box filters both. */
const rowsFor = (models: ModelOption[], query: string) => {
  const q = query.trim().toLowerCase();
  const found = models.filter((m) => m.label.toLowerCase().includes(q));
  return [...found.filter((m) => m.supported), ...found.filter((m) => !m.supported)];
};

export function ModelPicker({ models, value, onChange }: { models: ModelOption[]; value: string; onChange: (id: string) => void }) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const valueId = `${uid}-value`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null); // null: closed
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const open = place !== null;
  const rows = rowsFor(models, query);
  const flags = rows.map((m) => !m.supported);
  const chosen = models.find((m) => m.id === value);

  useEffect(() => {
    // With a mouse the search box takes the focus; on a touch screen that would raise the keyboard, so the panel itself does.
    if (open) (window.matchMedia('(pointer: fine)').matches ? search.current : panel.current)?.focus();
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [open, active, uid]);
  // The panel is fixed to the screen, so it closes when the page moves under it.
  useEffect(() => {
    if (!open) return;
    const width = window.innerWidth;
    const onResize = () => window.innerWidth !== width && close(false); // a touch keyboard changes the height only
    const onScroll = (e: Event) => e.target instanceof Node && !panel.current?.contains(e.target) && close(false);
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function show() {
    const r = trigger.current!.getBoundingClientRect();
    const { innerWidth: w, innerHeight: h } = window;
    const beside = r.right + PANEL.gap + PANEL.width <= w - PANEL.gap; // else the panel opens under the button
    const width = Math.min(PANEL.width, w - 2 * PANEL.gap);
    const left = beside ? r.right + PANEL.gap : Math.max(PANEL.gap, Math.min(r.left, w - width - PANEL.gap));
    const top = beside ? Math.max(PANEL.gap, Math.min(r.top, h - PANEL.height - PANEL.gap)) : r.bottom + 3;
    // A button near the bottom of the screen (the Image Generation bar) opens the panel above it when there is more room there.
    const above = r.top - PANEL.gap - 3;
    if (!beside && h - top - PANEL.gap < 240 && above > h - top - PANEL.gap) setPlace({ left, bottom: h - r.top + 3, width, maxHeight: Math.min(PANEL.height, above) });
    else setPlace({ left, top, width, maxHeight: Math.min(PANEL.height, h - top - PANEL.gap) });
    const list = rowsFor(models, '');
    const at = list.findIndex((m) => m.id === value && m.supported);
    setActive(at >= 0 ? at : Math.max(0, firstEnabled(list.map((m) => !m.supported))));
  }
  function close(returnFocus: boolean) {
    setPlace(null);
    setQuery('');
    if (returnFocus) trigger.current?.focus();
  }
  function choose(i: number) {
    const m = rows[i];
    if (!m?.supported) return;
    onChange(m.id);
    close(true);
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || ((e.key === 'Home' || e.key === 'End') && query === '')) {
      e.preventDefault();
      setActive(moveActive(e.key, active, flags));
    }
  }

  const group = (title: string, supported: boolean) => {
    const items = rows.map((m, i) => ({ m, i })).filter(({ m }) => m.supported === supported);
    if (items.length === 0) return null;
    return (
      <div role="group" aria-labelledby={`${uid}-group-${supported}`}>
        <div className="model-group" id={`${uid}-group-${supported}`}>
          {title}
        </div>
        {items.map(({ m, i }) => (
          <div key={m.id} id={optionId(i)} role="option" className="model-row" data-value={m.id} aria-selected={m.id === value} aria-disabled={!m.supported || undefined} data-active={i === active} onClick={() => choose(i)} onMouseMove={() => m.supported && setActive(i)}>
            <div className="model-row-text">
              <span className="model-name">
                {m.label}
                {m.isMock && <span className="badge">MOCK</span>}
              </span>
              <span className="model-sub">
                {m.rate !== undefined && <span>Tỉ lệ đạt: {m.rate}</span>}
                <span>Ước tính: ${m.estimateUsd}</span>
                {!m.supported && <span>Không hỗ trợ lựa chọn này</span>}
              </span>
            </div>
            {m.id === value && <Icon name="check" />}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="field">
      <span id={labelId} className="field-label">
        Mô hình
      </span>
      <div className="select" data-open={open}>
        <button
          ref={trigger}
          type="button"
          className="select-trigger"
          data-value={value}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${uid}-panel` : undefined}
          aria-labelledby={`${labelId} ${valueId}`}
          onMouseDown={(e) => open && e.preventDefault()} // keeps focus in the search box, so the click below closes the panel instead of reopening it
          onClick={() => (open ? close(true) : show())}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              show();
            }
          }}
        >
          <Icon name="model" />
          <span className="select-value select-value-row" id={valueId}>
            <span className="select-value-text">{chosen ? chosen.label : 'Chưa chọn mô hình'}</span>
            {chosen?.isMock && <span className="badge">MOCK</span>}
          </span>
          <Icon name={open ? 'up' : 'down'} />
        </button>
        {open && (
          <div
            ref={panel}
            id={`${uid}-panel`}
            className="model-pop"
            role="dialog"
            aria-label="Chọn mô hình"
            tabIndex={-1}
            style={place}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && close(false)}
            onMouseDown={(e) => e.target !== search.current && e.preventDefault()}
          >
            <div className="model-search">
              <Icon name="search" />
              <input
                ref={search}
                type="text"
                role="combobox"
                aria-label="Tìm mô hình"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={rows.length > 0 ? optionId(active) : undefined}
                placeholder="Tìm mô hình"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(Math.max(0, firstEnabled(rowsFor(models, e.target.value).map((m) => !m.supported))));
                }}
                onKeyDown={onKeyDown}
              />
            </div>
            <div role="listbox" id={listId} aria-label="Mô hình">
              {group('Mô hình phù hợp', true)}
              {group('Không hỗ trợ lựa chọn này', false)}
              {rows.length === 0 && <p className="model-empty">Không có mô hình nào khớp.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
