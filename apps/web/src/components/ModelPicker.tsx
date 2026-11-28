'use client';
// The model picker: a button that opens a floating panel beside it with a search box and the models.
// The panel opens on the chosen and the recommended model only; the Advanced button under them shows every model (a search always does).
// A long list opens on the featured models and one row per family (lib/model-families.ts), as Fash does: a family's models open in a flyout beside
// the panel, or under the family's row when there is no room beside it (a phone). A search, or a list short enough to be all featured, is flat.
// Focus moves to the search box, which drives the list through aria-activedescendant; Escape returns focus to the button.
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { firstEnabled, moveActive } from '@/lib/listbox';
import { byFamily, FEATURED, type Family, featured, shortList } from '@/lib/model-families';
import { MIN_MARKS } from '@/lib/model-marks';
import { CHIPS, type Chip, type Range as Match, searchModels, suggest } from '@/lib/model-search';
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
  /** What the model's provider can still spend (the API's `creditUsd`): a model whose estimate is over it is locked until the provider is topped up. */
  creditUsd?: string | null;
  /** Set by the picker on a model `creditUsd` locks. */
  locked?: boolean;
  /** Whether the viewer may see the provider's balance (Admins); a member sees only that the model is out of budget. */
  creditShown?: boolean;
  /** How many marks the score rests on: a model nobody has marked shows no score. */
  marks?: number;
  /** Why an unsupported model cannot take this form's settings (the ratio, length or image count), where the page can tell. */
  why?: string;
}

/** The recommendation shows only once the score rests on enough marks: a badge without evidence reads as a guess. A model without marks (none sent) keeps it. */
export const vouched = (m: Pick<ModelOption, 'recommended' | 'marks'>): boolean => !!m.recommended && (m.marks === undefined || m.marks >= MIN_MARKS);

/** Why a locked model cannot be picked: an Admin sees the provider's balance, a member only that it is out of budget (owner decision 2026-11-06). */
export const lockedText = (m: ModelOption) => (m.creditShown ? `Hết credits: còn $${Math.max(0, Number(m.creditUsd)).toFixed(2)}` : 'Tạm hết ngân sách, báo Admin');

/** A model over its provider's credit cannot be picked, like one the settings rule out. */
export const withCredit = (m: ModelOption): ModelOption =>
  m.creditUsd != null && Number(m.estimateUsd) > Number(m.creditUsd) ? { ...m, supported: false, locked: true } : m;

const PANEL = { width: 334, height: 446, gap: 8 };
const FLYOUT = { width: PANEL.width, row: 56 }; // as wide as the panel, so a row's details stay on one line

type Side = 'beside' | 'under' | 'above';
/** Where the panel opens for the button at `r`: beside it when there is room, else under it, or above it when the button is near the bottom of the
 * screen (the Image Generation bar). Chosen once at open, so the panel does not jump sides while it follows the button. */
function sideFor(r: DOMRect): Side {
  const { innerWidth: w, innerHeight: h } = window;
  if (r.right + PANEL.gap + PANEL.width <= w - PANEL.gap) return 'beside';
  const below = h - (r.bottom + 3) - PANEL.gap;
  return below < 240 && r.top - PANEL.gap - 3 > below ? 'above' : 'under';
}
/** Whether any of `el` is still in sight: inside the screen and inside every box around it that clips (a scrolling form card). */
function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  let [top, bottom, left, right] = [Math.max(r.top, 0), Math.min(r.bottom, window.innerHeight), Math.max(r.left, 0), Math.min(r.right, window.innerWidth)];
  for (let p = el.parentElement; p && top < bottom && left < right; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    const c = p.getBoundingClientRect();
    [top, bottom, left, right] = [Math.max(top, c.top), Math.min(bottom, c.bottom), Math.max(left, c.left), Math.min(right, c.right)];
  }
  return top < bottom && left < right;
}
/** The panel's fixed position on `side` of the button at `r`. */
function placement(r: DOMRect, side: Side): CSSProperties {
  const { innerWidth: w, innerHeight: h } = window;
  const width = Math.min(PANEL.width, w - 2 * PANEL.gap);
  const fit = (room: number) => Math.max(120, Math.min(PANEL.height, room)); // a sliver of a list is no use while the button nears the edge
  if (side === 'beside') {
    const top = Math.max(PANEL.gap, Math.min(r.top, h - PANEL.height - PANEL.gap));
    return { left: r.right + PANEL.gap, top, width, maxHeight: fit(h - top - PANEL.gap) };
  }
  const left = Math.max(PANEL.gap, Math.min(r.left, w - width - PANEL.gap));
  if (side === 'above') return { left, bottom: h - r.top + 3, width, maxHeight: fit(r.top - PANEL.gap - 3) };
  return { left, top: r.bottom + 3, width, maxHeight: fit(h - r.bottom - 3 - PANEL.gap) };
}

/** `ranges`: the label's characters a search matched, marked in the row. */
type Row = { model: ModelOption; ranges?: Match[]; recent?: boolean; family?: undefined; models?: undefined } | { model?: undefined; recent?: undefined; family: Family; models: ModelOption[] };
/** The open family: `style` places it beside the panel (none: under its row), and `inside` is true while the active option is one of its models. */
type Fly = { key: string; style?: CSSProperties; inside: boolean };

/** Supported models first, then the ones the current settings rule out. A search or a quick filter shows the ranked matches flat (lib/model-search.ts), as
 * does a short list; otherwise the featured ones, then the families. `folded` (lib/model-families.ts shortList) is what the panel shows until the Advanced button opens the rest. */
const rowsFor = (models: ModelOption[], query: string, chips: readonly Chip[], folded?: ModelOption[] | null, recent: ModelOption[] = []): Row[] => {
  if (query.trim() || chips.length) return searchModels(models, query, chips);
  // The recent picks lead an unfiltered long list; a flat list or the featured ones do not repeat them, a family still holds all its models.
  // A list of FEATURED or fewer shows its few models already: leading with the picks would only reorder it under the member's arrow keys.
  const picks = models.length > FEATURED ? recent : [];
  const lead: Row[] = picks.map((model) => ({ model, recent: true }));
  const rest = (list: ModelOption[]) => list.filter((m) => !picks.includes(m)).map((model) => ({ model }));
  if (folded) return [...lead, ...rest(folded)];
  const sorted = [...models.filter((m) => m.supported), ...models.filter((m) => !m.supported)];
  if (models.length <= FEATURED) return [...lead, ...rest(sorted)];
  return [...lead, ...rest(featured(models)), ...byFamily(sorted)];
};
/** The models last picked in any picker, newest first, kept in this browser only; a picker shows the first few that are in its own list. */
const RECENT_KEY = 'cvs.model-picker.recent';
const RECENT_SHOWN = 3;
function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return []; // storage blocked or the value spoiled: no recent group
  }
}
function remember(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 12))); // video and image pickers share the list
  } catch {}
}
const recentOf = (models: ModelOption[], ids: string[]) => ids.flatMap((id) => models.filter((m) => m.id === id)).slice(0, RECENT_SHOWN);
/** How long a panel closed by a click outside or a scroll keeps its search, filters and place in the list for the next open. */
const KEEP_MS = 30_000;
type Kept = { query: string; chips: Chip[]; more: boolean; active: number; key: string; scroll: number; at: number };
const keyOf = (r: Row | undefined) => r?.model?.id ?? r?.family?.key ?? '';
/** The label with the matched characters in <mark>. */
const marked = (label: string, ranges: Match[] | undefined): ReactNode => {
  if (!ranges?.length) return label;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    parts.push(label.slice(at, start), <mark key={start}>{label.slice(start, end)}</mark>);
    at = end;
  }
  return [...parts, label.slice(at)];
};
/** A model's clip lengths under its name, e.g. '4–15 giây'. */
export const lengths = (d: number[] | undefined) => {
  if (!d?.length) return null;
  const [min, max] = [Math.min(...d), Math.max(...d)];
  return min === max ? `${min} giây` : `${min}–${max} giây`;
};

/** `id` is the trigger button's, for a page that opens the picker from elsewhere (a click on it). */
export function ModelPicker({ models: given, value, onChange, id }: { models: ModelOption[]; value: string; onChange: (id: string) => void; id?: string }) {
  const models = given.map(withCredit);
  const uid = useId();
  const triggerId = id ?? `${uid}-trigger`;
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
  const side = useRef<Side>('beside');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [fly, setFly] = useState<Fly | null>(null);
  const [more, setMore] = useState(false); // Advanced pressed: the whole list until the panel closes
  const [chips, setChips] = useState<Chip[]>([]); // the quick filters under the search box
  const [recentIds, setRecentIds] = useState<string[]>([]); // read as the panel opens
  const kept = useRef<Kept | null>(null);
  const restoreScroll = useRef(0);
  // Where the list last scrolled itself to show the active row: its scroll event comes a frame later and must not close a flyout opened since.
  const selfScrolled = useRef<number | null>(null);
  const open = place !== null;
  // A search or a quick filter always looks through every model.
  const foldedFor = (q: string, c: readonly Chip[]) => (more || q.trim() || c.length ? null : shortList(models, value));
  const folded = foldedFor(query, chips);
  const recent = recentOf(models, recentIds);
  const rows = rowsFor(models, query, chips, folded, recent);
  const lead = rows.filter((r) => r.recent).length;
  const flyAt = fly ? rows.findIndex((r) => r.family?.key === fly.key) : -1;
  const flyModels = rows[flyAt]?.models ?? [];
  const inside = fly?.inside === true;
  const flags = inside ? flyModels.map((m) => !m.supported) : rows.map((r) => r.model?.supported === false);
  const activeId = inside ? flyId(active) : optionId(active);
  const chosen = models.find((m) => m.id === value);
  const hint = rows.length === 0 && query.trim() ? suggest(searchModels(models.filter((m) => m.supported), '', chips).map((h) => h.model), query) : null; // the nearest name among the models the chips keep
  const fresh = models.some((m) => !m.isNew); // when every model is new (a fresh database), the badge would tell nothing

  useEffect(() => {
    if (open) focusHome();
  }, [open]);
  // What close() keeps and the scroll listener below read, as that listener holds the close() of the render that opened the panel.
  const now = useRef({ query, chips, more, active: 0, key: '' });
  const sideFly = useRef(false);
  useEffect(() => {
    const at = inside ? flyAt : active; // in a flyout, its family's row
    now.current = { query, chips, more, active: at, key: keyOf(rows[at]) };
    sideFly.current = !!fly?.style;
  });
  useEffect(() => {
    const own = open ? document.getElementById(listId) : null;
    if (own && restoreScroll.current) {
      own.scrollTop = restoreScroll.current; // a reopen within KEEP_MS lands where the list was, the active row in sight or not
      restoreScroll.current = 0;
      return;
    }
    // Scrolls the list (or the flyout beside it) only: scrollIntoView would also scroll the form card behind the fixed panel.
    const row = open ? document.getElementById(activeId) : null;
    const list = row?.closest('[data-side]') ?? (open ? document.getElementById(listId) : null);
    if (!row || !list) return;
    const r = row.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    if (r.top < b.top) list.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) list.scrollTop += r.bottom - b.bottom;
    else return;
    if (list.id === listId) selfScrolled.current = list.scrollTop;
  }, [open, activeId, listId]);
  // The panel is fixed to the screen, so it follows its button while the page scrolls under it (owner request 2026-11-28: a stray wheel
  // must not lose the search), and closes once the button has left the screen.
  useEffect(() => {
    if (!open) return;
    const width = window.innerWidth;
    let frame = 0;
    const follow = () => {
      frame = 0;
      if (!trigger.current) return;
      if (!onScreen(trigger.current)) return close(false);
      setPlace(placement(trigger.current.getBoundingClientRect(), side.current));
      if (!sideFly.current) return;
      setFly(null); // a flyout beside the panel was placed for the old rows
      setActive(now.current.active); // back on its family's row, so Enter does not pick a model by the flyout's index
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && panel.current?.contains(e.target)) return; // the list's own scroll
      if (!frame) frame = requestAnimationFrame(follow);
    };
    const onResize = () => (window.innerWidth !== width ? close(false) : onScroll(new Event('resize'))); // a touch keyboard changes the height only
    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function show() {
    const r = trigger.current!.getBoundingClientRect();
    side.current = sideFor(r);
    const ids = readRecent();
    const k = kept.current && Date.now() - kept.current.at < KEEP_MS ? kept.current : null;
    kept.current = null;
    setRecentIds(ids);
    if (k) {
      setQuery(k.query);
      setChips(k.chips);
      setMore(k.more);
      restoreScroll.current = k.scroll;
    }
    const [q, c] = k ? [k.query, k.chips] : ['', []];
    const list = rowsFor(models, q, c, k?.more ? null : foldedFor(q, c), recentOf(models, ids));
    const row = k && list[k.active];
    setActive(k && row && keyOf(row) === k.key && row.model?.supported !== false ? k.active : startAt(list)); // the list may have changed since
    setPlace(placement(r, side.current));
  }
  /** On the chosen model, or the family that holds it (so ArrowRight opens it); its recent row only when that is its one place in the list. */
  function startAt(list: Row[]) {
    const holds = (r: Row) => (r.model ? r.model.id === value && r.model.supported : r.models.some((m) => m.id === value));
    const at = list.findIndex((r) => !r.recent && holds(r));
    const any = at >= 0 ? at : list.findIndex(holds);
    return any >= 0 ? any : Math.max(0, firstEnabled(list.map((r) => r.model?.supported === false)));
  }
  /** A new search or set of quick filters: the list starts again on its first model that can be picked. */
  function refilter(q: string, c: Chip[]) {
    setQuery(q);
    setChips(c);
    setFly(null);
    setActive(Math.max(0, firstEnabled(rowsFor(models, q, c, foldedFor(q, c), recent).map((r) => r.model?.supported === false))));
  }
  function showMore() {
    setMore(true);
    setFly(null);
    setActive(startAt(rowsFor(models, query, chips, null, recent)));
    focusHome(); // the button goes away
  }
  /** With a mouse the search box takes the focus; on a touch screen that would raise the keyboard, so the panel itself does.
   * preventScroll: the panel is fixed, so the form under it must not scroll away from where the member was looking. */
  function focusHome() {
    (window.matchMedia('(pointer: fine)').matches ? search.current : panel.current)?.focus({ preventScroll: true });
  }
  function close(returnFocus: boolean) {
    const scroll = document.getElementById(listId)?.scrollTop ?? 0;
    setPlace(null);
    setQuery('');
    setChips([]);
    setFly(null);
    setMore(false);
    if (returnFocus) trigger.current?.focus(); // its blur calls close(false) inside this call, so `kept` is set after it
    // A choice or Escape starts afresh next time; a click outside or the button scrolling away keeps the search for KEEP_MS (owner request 2026-11-28).
    kept.current = returnFocus ? null : { ...now.current, scroll, at: Date.now() };
  }
  function choose(m: ModelOption | undefined) {
    if (!m?.supported) return;
    remember(m.id);
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

  const modelRow = (m: ModelOption, id: string, current: boolean, onHover: () => void, ranges?: Match[]) => (
    <div key={id} id={id} role="option" className="model-row" data-value={m.id} aria-selected={m.id === value} aria-disabled={!m.supported || undefined} data-active={current} onClick={() => choose(m)} onMouseMove={() => m.supported && onHover()}>
      <div className="model-row-text">
        <span className="model-name">
          {marked(m.label, ranges)}
          {m.audio && (
            <span className="model-audio" title="Có âm thanh">
              <Icon name="speaker" />
              <span className="sr-only">Có âm thanh</span>
            </span>
          )}
          {m.isNew && fresh && <span className="badge badge-new">MỚI</span>}
          {m.isMock && <span className="badge">MOCK</span>}
          {vouched(m) && <span className="badge badge-recommended">Đề xuất</span>}
        </span>
        <span className="model-sub">
          {m.resolution && <span>{m.resolution}</span>}
          {lengths(m.durationsSec) && <span>{lengths(m.durationsSec)}</span>}
          <span>${m.estimateUsd}</span>
          {m.marks !== undefined && m.marks > 0 && m.marks < MIN_MARKS ? (
            <span>Ít đánh giá ({m.marks})</span>
          ) : (
            <>
              {m.score !== undefined && m.marks !== 0 && <span>Điểm {m.score}</span>}
              {m.rate !== undefined && <span>Đạt {m.rate}</span>}
            </>
          )}
          {m.locked ? <span>{lockedText(m)}</span> : !m.supported && <span>{m.why ?? 'Không hỗ trợ lựa chọn này'}</span>}
        </span>
      </div>
      {m.id === value && <Icon name="check" />}
    </div>
  );
  const topRow = (i: number) => {
    const r = rows[i]!;
    if (r.model) return modelRow(r.model, optionId(i), !inside && i === active, () => hoverRow(i), r.ranges);
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
        {first > lead && (
          <div role="group" aria-labelledby={`${uid}-group-featured`}>
            <div className="model-group" id={`${uid}-group-featured`}>
              <Icon name="star" size={10} /> Mô hình nổi bật
            </div>
            {indexes(lead, first).map(topRow)}
          </div>
        )}
        <div role="group" aria-labelledby={allId}>
          <div className="model-group" id={allId}>
            Tất cả mô hình
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
    const items = indexes(lead, rows.length).filter((i) => rows[i]!.model!.supported === supported);
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
      {/* A label, so a click on it opens the picker as a select's label does. */}
      <label id={labelId} htmlFor={triggerId} className="field-label">
        Mô hình
      </label>
      <div className="select" data-open={open}>
        <button
          ref={trigger}
          id={triggerId}
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
            <span className="select-value-text" title={chosen?.label}>{chosen ? chosen.label : 'Chưa chọn mô hình'}</span>
            {chosen?.isMock && <span className="badge">MOCK</span>}
            {chosen && vouched(chosen) && <span className="badge badge-recommended">Đề xuất</span>}
          </span>
          <Icon name={open ? 'up' : 'down'} />
        </button>
        {open && (
          <div
            ref={panel}
            id={`${uid}-panel`}
            className="model-pop"
            data-from={side.current} // which side of the button it grows from
            role="dialog"
            aria-label="Chọn mô hình"
            tabIndex={-1}
            style={place}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && close(false)}
            onKeyDown={(e) => e.key === 'Escape' && close(true)} // from a quick filter or a button; the search box handles its own
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
                onChange={(e) => refilter(e.target.value, chips)}
                onKeyDown={onKeyDown}
              />
            </div>
            <div className="model-chips" role="group" aria-label="Lọc nhanh">
              {CHIPS.map((c) => (
                <button key={c.key} type="button" className="model-chip" aria-pressed={chips.includes(c.key)} onClick={() => refilter(query, chips.includes(c.key) ? chips.filter((k) => k !== c.key) : [...chips, c.key])}>
                  {c.label}
                </button>
              ))}
            </div>
            {/* A flyout beside the panel is fixed to the screen, so a scroll of the list would leave it beside the wrong row. */}
            <div
              role="listbox"
              id={listId}
              aria-label="Mô hình"
              onScroll={(e) => {
                if (e.target !== e.currentTarget) return;
                const own = e.currentTarget.scrollTop === selfScrolled.current;
                selfScrolled.current = null;
                if (!own && fly?.style) inside ? leaveFamily() : setFly(null); // leaving puts the active row back on the family
              }}
            >
              {lead > 0 && (
                <div role="group" aria-labelledby={`${uid}-group-recent`}>
                  <div className="model-group" id={`${uid}-group-recent`}>
                    Dùng gần đây
                  </div>
                  {indexes(0, lead).map(topRow)}
                </div>
              )}
              {rows.some((r) => r.family) ? (
                sections()
              ) : (
                <>
                  {group('Mô hình phù hợp', true)}
                  {group('Không dùng được lúc này', false)}
                </>
              )}
            </div>
            {rows.length === 0 && (
              <div className="model-empty" role="status">
                <p>{query.trim() ? `Không thấy mô hình khớp “${query.trim()}”${chips.length ? ' trong bộ lọc đã chọn' : ''}.` : 'Không có mô hình nào hợp bộ lọc này.'}</p>
                {hint && (
                  <button type="button" onClick={() => choose(hint)}>
                    Ý bạn là <b>{hint.label}</b>?
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    refilter('', []);
                    focusHome(); // the button goes away with the empty list
                  }}
                >
                  {!chips.length ? 'Xoá tìm kiếm' : query.trim() ? 'Xoá tìm kiếm và bộ lọc' : 'Xoá bộ lọc'}
                </button>
              </div>
            )}
            {folded && (
              <button type="button" className="model-more" aria-expanded="false" onClick={showMore}>
                <span className="model-row-text">
                  <span className="model-name">Nâng cao</span>
                  <span className="model-sub">Xem tất cả {models.length} mô hình</span>
                </span>
                <Icon name="down" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
