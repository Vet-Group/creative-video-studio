'use client';
// The model picker: a button that opens a floating panel beside it with a search box and the models.
// A long list opens on the featured models and one row per family (lib/model-families.ts), as Fash does: a family's models open in a flyout beside
// the panel, or under the family's row when there is no room beside it (a phone). A search, or a list short enough to be all featured, is flat.
// Focus moves to the search box, which drives the list through aria-activedescendant; Escape returns focus to the button.
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { firstEnabled, moveActive } from '@/lib/listbox';
import { byFamily, FEATURED, type Family, featured } from '@/lib/model-families';
import { Icon } from './Icon';

export interface ModelOption {
  id: string;
  label: string;
  isMock: boolean;
  supported: boolean;
  /** The pass rate as text (video models). */
  rate?: string;
  estimateUsd: string;
  /** The recommendation score, 0-100 (lib/model-scores.ts), and whether this is the model to recommend. */
  score?: number;
  recommended?: boolean;
  /** Shown under the name: the output resolution (e.g. '1080p', or an image model's '1K/2K') and the range of clip lengths. */
  resolution?: string | null;
  durationsSec?: number[];
  /** It can make audio (a speaker icon). */
  audio?: boolean;
  /** Added in the last 14 days (the API's `isNew`). */
  isNew?: boolean;
}

const PANEL = { width: 334, height: 446, gap: 8 };
const FLYOUT = { width: PANEL.width, row: 56 }; // as wide as the panel, so a row's details stay on one line

type Row = { model: ModelOption; family?: undefined; models?: undefined } | { model?: undefined; family: Family; models: ModelOption[] };
/** The open family: `style` places it beside the panel (none: under its row), and `inside` is true while the active option is one of its models. */
type Fly = { key: string; style?: CSSProperties; inside: boolean };

/** Supported models first, then the ones the current settings rule out. A search or a short list shows them flat; otherwise the featured ones, then the families. */
const rowsFor = (models: ModelOption[], query: string): Row[] => {
  const q = query.trim().toLowerCase();
  const sorted = [...models.filter((m) => m.supported), ...models.filter((m) => !m.supported)];
  if (q || models.length <= FEATURED) return sorted.filter((m) => m.label.toLowerCase().includes(q)).map((model) => ({ model }));
  return [...featured(models).map((model) => ({ model })), ...byFamily(sorted)];
};
const lengths = (d: number[] | undefined) => {
  if (!d?.length) return null;
  const [min, max] = [Math.min(...d), Math.max(...d)];
  return min === max ? `${min}s` : `${min}s-${max}s`;
};

export function ModelPicker({ models, value, onChange }: { models: ModelOption[]; value: string; onChange: (id: string) => void }) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const valueId = `${uid}-value`;
  const listId = `${uid}-list`;
  const allId = `${uid}-group-all`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const flyId = (i: number) => `${uid}-fly-${i}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null); // null: closed
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [fly, setFly] = useState<Fly | null>(null);
  const open = place !== null;
  const rows = rowsFor(models, query);
  const flyAt = fly ? rows.findIndex((r) => r.family?.key === fly.key) : -1;
  const flyModels = rows[flyAt]?.models ?? [];
  const inside = fly?.inside === true;
  const flags = inside ? flyModels.map((m) => !m.supported) : rows.map((r) => r.model?.supported === false);
  const activeId = inside ? flyId(active) : optionId(active);
  const chosen = models.find((m) => m.id === value);
  const fresh = models.some((m) => !m.isNew); // when every model is new (a fresh database), the badge would tell nothing

  useEffect(() => {
    // With a mouse the search box takes the focus; on a touch screen that would raise the keyboard, so the panel itself does.
    // preventScroll: the panel is fixed, so the form under it must not scroll, which would close it.
    if (open) (window.matchMedia('(pointer: fine)').matches ? search.current : panel.current)?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    // Scrolls the list (or the flyout beside it) only: scrollIntoView would also scroll the form card behind the fixed panel and so close it.
    const row = open ? document.getElementById(activeId) : null;
    const list = row?.closest('[data-side]') ?? (open ? document.getElementById(listId) : null);
    if (!row || !list) return;
    const r = row.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    if (r.top < b.top) list.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) list.scrollTop += r.bottom - b.bottom;
  }, [open, activeId, listId]);
  // The panel is fixed to the screen, so it closes when the page moves under it.
  useEffect(() => {
    if (!open) return;
    const width = window.innerWidth;
    const onResize = () => window.innerWidth !== width && close(false); // a touch keyboard changes the height only
    // A scroll event can arrive just after the panel opened for a scroll that ended before it (the button scrolled into view), so only a real move closes it.
    const at = (t: EventTarget | null) => (t instanceof Element ? `${t.scrollTop},${t.scrollLeft}` : `${window.scrollY},${window.scrollX}`);
    const start = new Map<EventTarget | null, string>([[document, at(document)]]);
    for (let el = trigger.current?.parentElement; el; el = el.parentElement) start.set(el, at(el));
    const onScroll = (e: Event) => e.target instanceof Node && !panel.current?.contains(e.target) && start.get(e.target) !== at(e.target) && close(false);
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
    // On the chosen model, or the family that holds it.
    const at = rows.findIndex((r) => (r.model ? r.model.id === value && r.model.supported : r.models.some((m) => m.id === value)));
    setActive(at >= 0 ? at : Math.max(0, firstEnabled(flags)));
  }
  function close(returnFocus: boolean) {
    setPlace(null);
    setQuery('');
    setFly(null);
    if (returnFocus) trigger.current?.focus();
  }
  function choose(m: ModelOption | undefined) {
    if (!m?.supported) return;
    onChange(m.id);
    close(true);
  }
  /** Opens the family on row `i`: beside the panel when it fits, else under the row. `enter` moves the active option into it. */
  function openFamily(i: number, enter: boolean) {
    const family = rows[i]!;
    const row = document.getElementById(optionId(i))!.getBoundingClientRect();
    const p = panel.current!.getBoundingClientRect();
    const { innerWidth: w, innerHeight: h } = window;
    const height = Math.min(PANEL.height, family.models!.length * FLYOUT.row + 16);
    const top = Math.max(PANEL.gap, Math.min(row.top, h - height - PANEL.gap));
    const side = p.right + PANEL.gap + FLYOUT.width <= w - PANEL.gap;
    setFly({ key: family.family!.key, style: side ? { left: p.right + PANEL.gap, top, width: FLYOUT.width, maxHeight: h - top - PANEL.gap } : undefined, inside: enter });
    if (!enter) return setActive(i);
    const at = family.models!.findIndex((m) => m.id === value && m.supported);
    setActive(at >= 0 ? at : Math.max(0, firstEnabled(family.models!.map((m) => !m.supported))));
  }
  function leaveFamily() {
    setFly(null);
    setActive(flyAt);
  }
  function onKeyDown(e: KeyboardEvent) {
    const row = inside ? undefined : rows[active];
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (fly) leaveFamily();
      else close(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (row?.family) openFamily(active, true);
      else choose(inside ? flyModels[active] : row?.model);
    } else if (e.key === 'ArrowRight' && row?.family) {
      e.preventDefault();
      openFamily(active, true);
    } else if (e.key === 'ArrowLeft' && inside) {
      e.preventDefault();
      leaveFamily();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || ((e.key === 'Home' || e.key === 'End') && query === '')) {
      e.preventDefault();
      if (!inside) setFly(null);
      setActive(moveActive(e.key, active, flags));
    }
  }
  function hoverRow(i: number) {
    const r = rows[i]!;
    if (r.family) {
      // A flyout beside the panel follows the pointer; one under its row opens on a click, so the rows do not jump under the pointer.
      if (fly?.key !== r.family.key) {
        const p = panel.current!.getBoundingClientRect();
        if (p.right + PANEL.gap + FLYOUT.width <= window.innerWidth - PANEL.gap) return openFamily(i, false);
      } else if (inside) setFly({ ...fly, inside: false });
      return setActive(i);
    }
    if (!r.model.supported) return;
    if (fly?.style) setFly(null);
    else if (inside) setFly({ ...fly!, inside: false });
    setActive(i);
  }

  const modelRow = (m: ModelOption, id: string, current: boolean, onHover: () => void) => (
    <div key={id} id={id} role="option" className="model-row" data-value={m.id} aria-selected={m.id === value} aria-disabled={!m.supported || undefined} data-active={current} onClick={() => choose(m)} onMouseMove={() => m.supported && onHover()}>
      <div className="model-row-text">
        <span className="model-name">
          {m.label}
          {m.audio && (
            <span className="model-audio" title="Có âm thanh">
              <Icon name="speaker" />
              <span className="sr-only">Có âm thanh</span>
            </span>
          )}
          {m.isNew && fresh && <span className="badge badge-new">MỚI</span>}
          {m.isMock && <span className="badge">MOCK</span>}
          {m.recommended && <span className="badge badge-recommended">Đề xuất</span>}
        </span>
        <span className="model-sub">
          {m.resolution && <span>{m.resolution}</span>}
          {lengths(m.durationsSec) && <span>{lengths(m.durationsSec)}</span>}
          <span>${m.estimateUsd}</span>
          {m.score !== undefined && <span>Điểm {m.score}</span>}
          {m.rate !== undefined && <span>Đạt {m.rate}</span>}
          {!m.supported && <span>Không hỗ trợ lựa chọn này</span>}
        </span>
      </div>
      {m.id === value && <Icon name="check" />}
    </div>
  );
  const topRow = (i: number) => {
    const r = rows[i]!;
    if (r.model) return modelRow(r.model, optionId(i), !inside && i === active, () => hoverRow(i));
    const below = fly?.key === r.family.key && !fly.style;
    return (
      <div key={r.family.key} id={optionId(i)} role="option" className="model-row model-family" data-active={!inside && i === active} data-open={fly?.key === r.family.key} onClick={() => (below ? setFly(null) : openFamily(i, false))} onMouseMove={() => hoverRow(i)}>
        <div className="model-row-text">
          <span className="model-name">{r.family.name}</span>
          <span className="model-sub">{r.family.note}</span>
        </div>
        {r.models.some((m) => m.id === value) && <Icon name="check" />}
        <Icon name={below ? 'down' : 'right'} />
      </div>
    );
  };
  const indexes = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k);

  /** The sections: the featured models, then the families with the open one's models after its row (shown beside the panel or under the row). */
  const sections = () => {
    const first = rows.findIndex((r) => r.family);
    const split = flyAt >= 0 ? flyAt + 1 : rows.length;
    return (
      <>
        {first > 0 && (
          <div role="group" aria-labelledby={`${uid}-group-featured`}>
            <div className="model-group" id={`${uid}-group-featured`}>
              <Icon name="star" size={10} /> Model nổi bật
            </div>
            {indexes(0, first).map(topRow)}
          </div>
        )}
        <div role="group" aria-labelledby={allId}>
          <div className="model-group" id={allId}>
            Tất cả model
          </div>
          {indexes(first, split).map(topRow)}
        </div>
        {fly && flyAt >= 0 && (
          <div role="group" aria-label={rows[flyAt]!.family!.name} className="model-fly" data-side={fly.style ? 'true' : undefined} style={fly.style}>
            {flyModels.map((m, j) =>
              modelRow(m, flyId(j), inside && j === active, () => {
                if (!inside) setFly({ ...fly, inside: true });
                setActive(j);
              }),
            )}
          </div>
        )}
        {split < rows.length && (
          <div role="group" aria-labelledby={allId}>
            {indexes(split, rows.length).map(topRow)}
          </div>
        )}
      </>
    );
  };
  const group = (title: string, supported: boolean) => {
    const items = indexes(0, rows.length).filter((i) => rows[i]!.model!.supported === supported);
    if (items.length === 0) return null;
    return (
      <div role="group" aria-labelledby={`${uid}-group-${supported}`}>
        <div className="model-group" id={`${uid}-group-${supported}`}>
          {title}
        </div>
        {items.map(topRow)}
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
            {chosen?.recommended && <span className="badge badge-recommended">Đề xuất</span>}
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
                aria-activedescendant={rows.length > 0 ? activeId : undefined}
                placeholder="Tìm mô hình"
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setFly(null);
                  setActive(Math.max(0, firstEnabled(rowsFor(models, e.target.value).map((r) => r.model?.supported === false))));
                }}
                onKeyDown={onKeyDown}
              />
            </div>
            {/* A flyout beside the panel is fixed to the screen, so a scroll of the list would leave it beside the wrong row. */}
            <div role="listbox" id={listId} aria-label="Mô hình" onScroll={(e) => e.target === e.currentTarget && fly?.style && setFly(null)}>
              {rows.some((r) => r.family) ? (
                sections()
              ) : (
                <>
                  {group('Mô hình phù hợp', true)}
                  {group('Không hỗ trợ lựa chọn này', false)}
                </>
              )}
              {rows.length === 0 && <p className="model-empty">Không có mô hình nào khớp.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
