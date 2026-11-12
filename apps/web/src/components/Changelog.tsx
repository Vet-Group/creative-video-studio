'use client';
// The changelog page: entries by Vietnam day, newest first, with filter chips by kind. Opening it marks every entry seen.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type ChangeEntry, type ChangeKind, KIND_LABEL } from '@/lib/changelog';
import { loadSeen, markSeen, unseenEntries } from '@/lib/changelog-seen';
import { vnDay } from '@/lib/lark-prompt';
import { Icon } from './Icon';
import { KindChip } from './KindChip';

const TZ = 'Asia/Ho_Chi_Minh';
const fmtDay = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: TZ });
const fmtTime = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const PR_URL = 'https://github.com/Vet-Group/creative-video-studio/pull/';

export function Changelog({ entries, isAdmin }: { entries: ChangeEntry[]; isAdmin: boolean }) {
  const [kind, setKind] = useState<ChangeKind | 'all'>('all');
  /** The entries that were unseen when the page opened, kept marked for this visit although opening it marks them seen. */
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setFresh(new Set(unseenEntries(entries, loadSeen(entries)).map((e) => e.at)));
    markSeen(entries);
  }, []); // once, on opening: a second run would find nothing unseen
  const kinds: (ChangeKind | 'all')[] = ['all', 'new', 'improved', 'fixed', ...(isAdmin ? (['ops'] as const) : [])];
  const days = new Map<string, ChangeEntry[]>();
  for (const e of entries) {
    const day = vnDay(new Date(e.at));
    if (kind === 'all' || e.kind === kind) days.set(day, [...(days.get(day) ?? []), e]);
  }
  return (
    <section aria-labelledby="changelog-title" className="changelog">
      <h1 id="changelog-title">Có gì mới</h1>
      <p className="muted changelog-sub">Những thay đổi của Video Studio theo từng ngày: có gì mới, từ khi nào và dùng để làm gì.</p>
      <div className="kinds" role="group" aria-label="Loại thay đổi">
        {kinds.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'all' ? 'Tất cả' : KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {days.size === 0 ? (
        <p className="muted" role="status">
          {entries.length === 0 ? 'Chưa có thay đổi nào.' : 'Chưa có thay đổi nào thuộc loại này.'}
        </p>
      ) : (
        [...days].map(([day, items]) => (
          <section key={day} aria-labelledby={`changelog-day-${day}`}>
            <h2 id={`changelog-day-${day}`} className="changelog-day">
              {fmtDay.format(new Date(items[0]!.at))}
            </h2>
            <ol className="changelog-list" aria-labelledby={`changelog-day-${day}`}>
              {items.map((e) => (
                <li key={e.at} className="changelog-entry" data-fresh={fresh.has(e.at) || undefined}>
                  <p className="changelog-meta">
                    <KindChip kind={e.kind} />
                    {e.audience === 'admin' && <span className="changelog-admin">Chỉ quản trị viên</span>}
                    <time dateTime={e.at}>{fmtTime.format(new Date(e.at))}</time>
                    {fresh.has(e.at) && <span className="changelog-fresh">Chưa xem</span>}
                  </p>
                  <h3>{e.title}</h3>
                  {e.details.map((d) => (
                    <p key={d}>{d}</p>
                  ))}
                  {(e.href || (isAdmin && e.prs.length > 0)) && (
                    <p className="changelog-links">
                      {e.href && (
                        <Link href={e.href}>
                          Mở trang <Icon name="right" size={14} />
                        </Link>
                      )}
                      {isAdmin &&
                        e.prs.map((n) => (
                          <a key={n} href={`${PR_URL}${n}`} target="_blank" rel="noreferrer" aria-label={`Pull request ${n}`}>
                            #{n}
                          </a>
                        ))}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </section>
  );
}
