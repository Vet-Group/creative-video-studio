'use client';
// "Which tool?": the five creative tools side by side, opened from the sidebar, each tool page's hint strip and Explore.
import Link from 'next/link';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { HINTS_KEY as HIDDEN_KEY } from '@/lib/onboarding';
import { TOOL_GOALS, TOOL_GUIDE, type ToolHref, toolGuide } from '@/lib/tool-guide';
import { Icon } from './Icon';
import { Modal } from './Modal';

/** Opens the guide; the Shell provides it, so any page under it can. */
export const OpenToolGuide = createContext<() => void>(() => undefined);

export function ToolGuideButton({ className, children = 'Chọn công cụ nào?' }: { className?: string; children?: ReactNode }) {
  const open = useContext(OpenToolGuide);
  return (
    <button type="button" className={className} onClick={open}>
      <Icon name="help" size={14} />
      {children}
    </button>
  );
}

export function ToolGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Chọn công cụ nào?" className="tool-guide">
      <h2>Chọn công cụ nào?</h2>
      <p className="modal-sub">Năm công cụ trong nhóm Sáng tạo làm năm việc khác nhau. Bắt đầu từ thứ bạn đang có và thứ bạn cần.</p>

      <h3>Bạn cần gì?</h3>
      <ul className="tool-goals">
        {TOOL_GOALS.map((g) => (
          <li key={g.need}>
            <Link href={g.href} onClick={onClose}>
              <span>{g.need}</span>
              <strong>
                {g.go}
                <Icon name="right" size={14} />
              </strong>
            </Link>
          </li>
        ))}
      </ul>

      <h3>So sánh nhanh</h3>
      <div className="tool-compare-wrap">
        <table className="tool-compare">
          <thead>
            <tr>
              <th scope="col">Công cụ</th>
              <th scope="col">Bạn đưa vào</th>
              <th scope="col">Bạn nhận về</th>
              <th scope="col">Thời gian chờ</th>
            </tr>
          </thead>
          <tbody>
            {TOOL_GUIDE.map((t) => (
              <tr key={t.href}>
                <th scope="row">{t.title}</th>
                <td data-label="Bạn đưa vào">{t.have}</td>
                <td data-label="Bạn nhận về">{t.get}</td>
                <td data-label="Thời gian chờ">{t.wait}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Chi phí ước tính bằng USD hiện trên nút chạy của từng trang trước khi bạn bấm. Ảnh thường rẻ hơn video; Tối ưu media miễn phí.</p>

      {TOOL_GUIDE.map((t) => (
        <section key={t.href} className="tool-entry" aria-labelledby={`tool-entry-${t.icon}`}>
          <h3 id={`tool-entry-${t.icon}`}>
            <Icon name={t.icon} size={16} />
            {t.title}
          </h3>
          <p>{t.oneLine}</p>
          <div className="tool-entry-cols">
            <div>
              <h4>Dùng khi</h4>
              <ul>
                {t.useWhen.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Nên dùng công cụ khác khi</h4>
              <ul>
                {t.notWhen.map((n) => (
                  <li key={n.text}>
                    {n.text}:{' '}
                    <Link href={n.href} onClick={onClose}>
                      {n.go}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="tool-example">
            <strong>Ví dụ.</strong> {t.example.have} → {t.example.get}
          </p>
          <Link href={t.href} className="tool-open" onClick={onClose}>
            Mở {t.title}
          </Link>
        </section>
      ))}
    </Modal>
  );
}

function hiddenHints(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** The strip at the top of a tool page: when to use it, where to go instead, the guide. Closed, it folds per page into a one-line chip that opens it again. */
export function PageHint({ href }: { href: ToolHref }) {
  const t = toolGuide(href)!;
  const [hidden, setHidden] = useState(false);
  useEffect(() => setHidden(hiddenHints().includes(href)), [href]);
  function remember(hide: boolean) {
    setHidden(hide);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hide ? [...new Set([...hiddenHints(), href])] : hiddenHints().filter((h) => h !== href)));
    } catch {} // storage blocked: for this visit only
  }
  if (hidden) {
    return (
      <button type="button" className="tool-hint-chip" onClick={() => remember(false)}>
        <Icon name="help" size={14} />
        Khi nào dùng {t.title}?
      </button>
    );
  }
  return (
    <aside className="tool-hint" aria-label={`Khi nào dùng ${t.title}`}>
      <p>
        <strong>Dùng khi:</strong> {t.useIf}
      </p>
      <p className="tool-hint-else">
        Cần việc khác?{' '}
        {t.notWhen.slice(0, 2).map((n, i) => (
          <span key={n.href}>
            {i > 0 && ' · '}
            <Link href={n.href} title={n.text}>
              {n.go}
            </Link>
          </span>
        ))}
        {' · '}
        <ToolGuideButton className="link-button">So sánh các công cụ</ToolGuideButton>
      </p>
      <button type="button" className="icon-button tool-hint-close" aria-label="Ẩn gợi ý này" title="Ẩn gợi ý này" onClick={() => remember(true)}>
        <Icon name="x" size={14} />
      </button>
    </aside>
  );
}
