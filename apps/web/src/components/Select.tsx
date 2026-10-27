'use client';
// A custom select: a button that opens a listbox under it. It follows the ARIA select-only combobox pattern:
// focus stays on the button and aria-activedescendant names the highlighted option.
import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { firstEnabled, moveActive } from '@/lib/listbox';
import { Icon, type IconName } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  /** What the closed select shows, when the option label is too long for a half-width field. */
  short?: string;
  disabled?: boolean;
}

const MOVES = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/** A ratio select's icon takes the chosen shape, as on the live form; "auto" and wide ratios keep the wide frame. */
function ratioIcon(value: string): IconName {
  const [w, h] = value.split(':').map(Number);
  if (!w || !h) return 'ratio';
  return w < h ? 'ratio-tall' : w === h ? 'ratio-square' : 'ratio';
}

export function Select({ label, icon, heading, value, options, onChange }: { label: string; icon: IconName; heading: string; value: string; options: SelectOption[]; onChange: (value: string) => void }) {
  const uid = useId();
  const triggerId = `${uid}-trigger`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const flags = options.map((o) => !!o.disabled);
  const selected = options.findIndex((o) => o.value === value);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [open, active, uid]);

  function show() {
    setActive(selected >= 0 && !flags[selected] ? selected : Math.max(0, firstEnabled(flags)));
    setOpen(true);
  }
  function pick(i: number) {
    if (flags[i]) return;
    onChange(options[i]!.value);
    setOpen(false);
  }
  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab') setOpen(false);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (MOVES.includes(e.key)) {
      e.preventDefault();
      setActive(moveActive(e.key, active, flags));
    }
  }

  return (
    <div className="field">
      <label htmlFor={triggerId} className="field-label">
        {label}
      </label>
      <div className="select" data-open={open}>
        <button
          type="button"
          id={triggerId}
          className="select-trigger"
          data-value={value}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? optionId(active) : undefined}
          onClick={(e) => {
            e.currentTarget.focus(); // Safari and Firefox on macOS do not focus a clicked button, and the list closes on blur
            if (open) setOpen(false);
            else show();
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => e.key === ' ' && e.preventDefault()} // a released Space must not click the button again
          onBlur={() => setOpen(false)}
        >
          <Icon name={icon === 'ratio' ? ratioIcon(value) : icon} />
          <span className="select-value">{options[selected]?.short ?? options[selected]?.label ?? value}</span>
          <Icon name={open ? 'up' : 'down'} />
        </button>
        {open && (
          <div className="select-pop" onMouseDown={(e) => e.preventDefault()}>
            <div className="select-heading" aria-hidden="true">
              {heading}
            </div>
            <ul role="listbox" id={listId} aria-label={label}>
              {options.map((o, i) => (
                <li key={o.value} id={optionId(i)} role="option" data-value={o.value} aria-selected={i === selected} aria-disabled={o.disabled || undefined} data-active={i === active} onClick={() => pick(i)} onMouseMove={() => !o.disabled && setActive(i)}>
                  <span>{o.label}</span>
                  {i === selected && <Icon name="check" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
