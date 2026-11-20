'use client';
// One of two sources for the same words: a library pick (Marketing's hook) or the member's own text. Only one is sent, so only one shows: while a pick is
// chosen the own box folds into a card naming it, with a way to change it or to write instead, and writing drops the pick. The own words are kept meanwhile.
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';

interface Props {
  /** The pick's name in the buttons and labels: "hook". */
  noun: string;
  /** The chosen pick as the box shows it; undefined while none is chosen, when the own box shows. */
  chosen: string | undefined;
  /** Opens the library to choose or change the pick. */
  onOpen: () => void;
  /** Drops the pick, so the own words count again. */
  onDrop: () => void;
  /** The picker's box on the form, which shows the chosen pick's sample. */
  box: ReactNode;
  /** The own-words box. */
  own: ReactNode;
  /** There are own words, kept but not sent while the pick is in use. */
  kept: boolean;
  /** The note under the card while `kept`, for a page where the default does not fit. */
  keptNote?: string;
}

export function PresetOrOwn({ noun, chosen, onOpen, onDrop, box, own, kept, keptNote = 'Chữ bạn tự viết vẫn được giữ, chỉ gửi khi chọn Tự viết.' }: Props) {
  const name = useId();
  const root = useRef<HTMLDivElement>(null);
  const [focusOwn, setFocusOwn] = useState(false);
  // After "write instead" the own box mounts again: the focus goes to it, so the member can type straight away.
  useEffect(() => {
    if (!focusOwn || chosen !== undefined) return;
    root.current?.querySelector('textarea')?.focus();
    setFocusOwn(false);
  }, [focusOwn, chosen]);
  const write = () => (onDrop(), setFocusOwn(true));
  const title = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <div ref={root} className="preset-or-own">
      <div className="segmented theme-choice" role="radiogroup" aria-label={`Nguồn ${noun}`}>
        <label>
          <input type="radio" name={name} checked={chosen !== undefined} onChange={onOpen} />
          Có sẵn
        </label>
        <label>
          <input type="radio" name={name} checked={chosen === undefined} onChange={write} />
          Tự viết
        </label>
      </div>
      {box}
      {chosen === undefined ? (
        own
      ) : (
        <div className="preset-in-use" role="group" aria-label={`${title} đang dùng`}>
          <p>
            <Icon name="check" size={13} />
            <span>
              Đang dùng: <strong>{chosen}</strong>
            </span>
          </p>
          <div className="preset-in-use-actions">
            <button type="button" className="link-button" aria-haspopup="dialog" onClick={onOpen}>
              Đổi {noun}
            </button>
            <button type="button" className="link-button" onClick={write}>
              Tự viết thay
            </button>
          </div>
          {kept && <p className="help">{keptNote}</p>}
        </div>
      )}
    </div>
  );
}
