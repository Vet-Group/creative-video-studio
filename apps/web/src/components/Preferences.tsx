// Settings > Preferences: what happens on this device when a job finishes, and the keyboard shortcuts. Each block is one subsection.
import { type ReactNode, useId, useState } from 'react';
import { chime, notificationState, readPref, writePref } from '@/lib/preferences';
import { Icon, type IconName } from './Icon';

/** One preference row: an icon tile, the title and description, and an on/off switch named by the title. */
function SwitchRow({ icon, title, children, on, disabled, onToggle }: { icon: IconName; title: string; children: ReactNode; on: boolean; disabled?: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <li className="acct-row pref-row">
      <span className="acct-mark" aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <span className="acct-text">
        <strong id={`${id}-title`}>{title}</strong>
        <span id={`${id}-desc`}>{children}</span>
      </span>
      <button type="button" role="switch" className="switch" aria-checked={on} aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} disabled={disabled} onClick={onToggle} />
    </li>
  );
}

const NOTIFY_NOTE = {
  unsupported: 'Trình duyệt này không hỗ trợ thông báo.',
  denied: 'Trình duyệt đang chặn thông báo của trang này. Hãy cho phép trong phần cài đặt trang web của trình duyệt.',
} as const;

const SHORTCUTS: readonly (readonly [string[], string])[] = [
  [['Ctrl', 'Enter'], 'Chạy job khi đang nhập mô tả (⌘ + Enter trên Mac)'],
  [['Ctrl', ','], 'Mở Cài đặt từ bất kỳ trang nào (⌘ + , trên Mac)'],
  [['Esc'], 'Đóng hộp thoại, menu hoặc danh sách đang mở'],
  [['↑', '↓'], 'Di chuyển trong danh sách model và menu chọn, Enter để chọn'],
];

export function Preferences() {
  const [permission, setPermission] = useState(notificationState);
  const [notify, setNotify] = useState(() => readPref('notify') && notificationState() === 'granted');
  const [sound, setSound] = useState(() => readPref('chime'));

  async function toggleNotify() {
    if (notify) {
      writePref('notify', false);
      return setNotify(false);
    }
    const p = permission === 'default' ? await Notification.requestPermission() : permission;
    setPermission(p);
    if (p !== 'granted') return;
    writePref('notify', true);
    setNotify(true);
  }
  function toggleSound() {
    writePref('chime', !sound);
    if (!sound) chime(); // a sample, which also lets the browser play it later
    setSound(!sound);
  }

  return (
    <>
      <p className="settings-kicker" id="settings-done">
        Khi job xong
      </p>
      <ul className="acct-rows" aria-labelledby="settings-done">
        <SwitchRow icon="clock" title="Thông báo khi xong" on={notify} disabled={permission === 'unsupported'} onToggle={() => void toggleNotify()}>
          {permission === 'unsupported' || permission === 'denied' ? NOTIFY_NOTE[permission] : 'Thông báo của hệ thống khi clip hoặc ảnh xong lúc bạn đang ở tab khác.'}
        </SwitchRow>
        <SwitchRow icon="speaker" title="Âm báo" on={sound} onToggle={toggleSound}>
          Một tiếng chuông ngắn khi clip hoặc ảnh xong.
        </SwitchRow>
      </ul>
      <p className="settings-note">Hai tuỳ chọn này chỉ áp dụng trên thiết bị và trình duyệt này.</p>
      <p className="settings-kicker settings-sub" id="settings-keys">
        Phím tắt
      </p>
      <ul className="acct-rows" aria-labelledby="settings-keys">
        {SHORTCUTS.map(([keys, text]) => (
          <li key={text} className="acct-row key-row">
            <span className="keys">
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </span>
            <span className="acct-text">{text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
