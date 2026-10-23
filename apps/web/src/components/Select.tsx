'use client';
// A custom select: a button that opens a listbox under it. It follows the ARIA select-only combobox pattern:
// focus stays on the button and aria-activedescendant names the highlighted option.
import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { firstEnabled, moveActive } from '@/lib/listbox';
import { Icon, type IconName } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const MOVES = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

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
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => e.key === ' ' && e.preventDefault()} // a released Space must not click the button again
          onBlur={() => setOpen(false)}
        >
          <Icon name={icon} />
          <span className="select-value">{options[selected]?.label ?? value}</span>
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
