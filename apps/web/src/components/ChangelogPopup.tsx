'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ChangeEntry } from '@/lib/changelog';
import { CHANGELOG_POPUP_KEY, changelogPopupDue, loadSeen, markSeen, unseenEntries } from '@/lib/changelog-seen';
import { LARK_PROMPT_KEY, larkPromptDue, vnDay } from '@/lib/lark-prompt';
import { KindChip } from './KindChip';
import { Modal } from './Modal';

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * A popup at most once a Vietnam day (per browser) listing the newest entries a member has not seen. A first visit marks everything seen instead,
 * and a visit the Lark reminder takes is skipped. It must sit before LarkLinkPrompt in the Shell: effects run in tree order, so this one reads
 * the Lark day before that prompt writes today's.
 */
export function ChangelogPopup({ entries, larkPrompt }: { entries: ChangeEntry[]; larkPrompt: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<ChangeEntry[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (pathname === '/changelog') return; // opening the page marks everything seen
    const unseen = unseenEntries(entries, loadSeen(entries));
    const today = vnDay(new Date());
    const due = changelogPopupDue({ unseen: unseen.length, lastShown: read(CHANGELOG_POPUP_KEY), today, larkDue: larkPrompt && larkPromptDue(read(LARK_PROMPT_KEY), today) });
    if (!due) return;
    try {
      localStorage.setItem(CHANGELOG_POPUP_KEY, today);
    } catch {} // storage blocked: shown on each visit rather than never
    setItems(unseen.slice(0, 3));
    setOpen(true);
  }, []); // once per visit: the Shell stays mounted across navigations

  function seeAll() {
    markSeen(entries);
    setOpen(false);
    router.push('/changelog');
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} label="Có gì mới" className="confirm">
      <h2>Có gì mới</h2>
      <p>Những thay đổi mới nhất bạn chưa xem:</p>
      <ul className="changelog-popup">
        {items.map((e) => (
          <li key={e.at}>
            <KindChip kind={e.kind} />
            <span>{e.title}</span>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={() => setOpen(false)}>
          Để sau
        </button>
        <button type="button" className="primary" onClick={seeAll}>
          Xem tất cả
        </button>
      </div>
    </Modal>
  );
}
