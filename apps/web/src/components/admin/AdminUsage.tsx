'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '@/components/Icon';
import { LoadError } from '@/components/LoadError';
import { useFetch } from '@/lib/admin-ui';
import { vnDay } from '@/lib/lark-prompt';
import { formatDay, parsePeriod, presetPeriod } from '@/lib/period';
import type { UsageReport } from '@/lib/usage';
import { USAGE_STATUS } from '@/lib/usage-status';
import { Empty, PageHead } from './PageHead';
import { PeriodPicker } from './PeriodPicker';

const money = (v: string) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? formatDay(vnDay(new Date(iso))) : '—');
const clock = (at: Date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh' }).format(at);

/** The figures over the teams: people, who used CVS in the period, who never signed in, and the period's spend. */
function Kpis({ data }: { data: UsageReport }) {
  const t = data.totals;
  return (
    <div className="kpis" role="group" aria-label="Số liệu chung">
      <div className="kpi">
        <p className="kpi-label">Nhân viên</p>
        <p className="kpi-value">{t.people}</p>
        <p className="kpi-sub">trong {data.teams.length} team</p>
      </div>
      <div className="kpi">
        <p className="kpi-label">Có dùng trong khoảng</p>
        <p className="kpi-value">
          {t.using} <span>· {t.usingPct}%</span>
        </p>
        <p className="kpi-sub">
          {t.lapsed} ngưng trước khoảng · {t.idle} đã vào, chưa tạo
        </p>
      </div>
      <div className="kpi">
        <p className="kpi-label">Chưa đăng nhập</p>
        <p className="kpi-value">{t.never}</p>
      </div>
      <div className="kpi">
        <p className="kpi-label">Chi phí trong khoảng</p>
        <p className="kpi-value" title={`$${t.usd}`}>
          {money(t.usdDisplay)}
        </p>
        <p className="kpi-sub">Từ trước tới nay {money(t.usdAllDisplay)}</p>
      </div>
    </div>
  );
}

/** A team: its people, how many used CVS and its spend in the period, then one row per person. */
function TeamCard({ team }: { team: UsageReport['teams'][number] }) {
  const id = useId();
  return (
    <section className="panel usage-team" aria-labelledby={id}>
      <div className="panel-head">
        <h2 id={id}>
          {team.name}
          {team.excluded && <span className="tag">Không tính báo cáo</span>}
        </h2>
        <p className="usage-team-figures">
          {team.people} người · {team.using} có dùng · <span title={`$${team.usd}`}>{money(team.usdDisplay)}</span>
        </p>
      </div>
      <div className="table-wrap" role="region" aria-label={`Người dùng của ${team.name}`} tabIndex={0}>
        <table className="sticky-first">
          <thead>
            <tr>
              <th scope="col">Người dùng</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" className="num">
                $ trong khoảng
              </th>
              <th scope="col" className="num">
                $ từ trước tới nay
              </th>
              <th scope="col" className="num">
                Lượt tạo
              </th>
              <th scope="col" className="num">
                Phân tích video
              </th>
              <th scope="col">Dùng lần cuối</th>
              <th scope="col">Đăng nhập lần cuối</th>
            </tr>
          </thead>
          <tbody>
            {team.users.map((u) => (
              <tr key={u.id}>
                <td title={u.email}>
                  {u.name}
                  {u.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </td>
                <td>
                  <span className="status" data-status={u.status}>
                    {USAGE_STATUS[u.status]}
                  </span>
                </td>
                <td className="num" title={`$${u.usd}`}>
                  {money(u.usdDisplay)}
                </td>
                <td className="num" title={`$${u.usdAll}`}>
                  {money(u.usdAllDisplay)}
                </td>
                <td className="num">{u.jobs}</td>
                <td className="num">{u.analyses}</td>
                <td className="nowrap">{day(u.lastUsedAt)}</td>
                <td className="nowrap">{day(u.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Admin › Usage: who in each team used CVS in the period of the address (default this ICT month), real users only unless `real=0`, with CSV and PNG downloads. */
export function AdminUsage() {
  const router = useRouter();
  const params = useSearchParams();
  const parsed = parsePeriod(params);
  const period = 'error' in parsed ? presetPeriod('month') : parsed;
  const real = params.get('real') !== '0';
  const query = `from=${period.from}&to=${period.to}${real ? '' : '&real=0'}`;
  const { data, failed, reload } = useFetch<UsageReport>(`/api/admin/usage?${query}`, { onTabReturn: true });
  const loadedAt = useMemo(() => new Date(), [data]);
  const [png, setPng] = useState<'idle' | 'busy' | 'failed'>('idle');
  const shot = useRef<HTMLDivElement>(null);
  const id = useId();

  function showAll(all: boolean) {
    const q = new URLSearchParams(window.location.search);
    if (all) q.set('real', '0');
    else q.delete('real');
    router.replace(`${window.location.pathname}?${q}`, { scroll: false });
  }

  // The copy below is rendered at once (flushSync), drawn by html-to-image, loaded only now, and dropped again.
  async function savePng() {
    if (!data) return;
    flushSync(() => setPng('busy'));
    try {
      const { toBlob } = await import('html-to-image');
      await document.fonts.ready;
      // shortcut: no auto-scale, so the width stays 2400 px; past the browser's canvas height (about 350 people) it fails and says so, then split by team.
      const blob = await toBlob(shot.current!, { width: 1200, pixelRatio: 2, skipAutoScale: true });
      if (!blob) throw new Error('no image');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cvs-usage-${data.period.from}-${data.period.to}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPng('idle');
    } catch {
      setPng('failed');
    }
  }

  return (
    <section className="usage" aria-labelledby="usage-title">
      <PageHead id="usage-title" title="Mức độ sử dụng" lead="Ai trong từng team đã dùng CVS trong khoảng đã chọn, theo giờ Việt Nam, để báo cáo mức độ áp dụng.">
        <a className="button" href={`/api/admin/usage/csv?${query}`} download>
          <Icon name="download" />
          Tải CSV
        </a>
        <button type="button" onClick={savePng} disabled={!data || png === 'busy'}>
          <Icon name="image" />
          {png === 'busy' ? 'Đang tạo ảnh...' : 'Tải ảnh PNG'}
        </button>
      </PageHead>
      {png === 'failed' && <LoadError text="Không tạo được ảnh PNG." onRetry={savePng} />}
      <div className="usage-bar">
        <PeriodPicker period={period} />
        <div className="usage-real">
          <span className="switch-row">
            <button type="button" id={`${id}-real`} role="switch" className="switch" aria-checked={real} aria-labelledby={`${id}-real-label`} aria-describedby={`${id}-real-note`} onClick={() => showAll(real)} />
            <label id={`${id}-real-label`} htmlFor={`${id}-real`}>
              Chỉ người dùng thật
            </label>
          </span>
          <small id={`${id}-real-note`}>
            {real ? `Đã ẩn ${data?.real ? data.hidden.people : '…'} tài khoản hệ thống, tài khoản thử và team không tính báo cáo.` : 'Đang hiện cả tài khoản hệ thống, tài khoản thử và team không tính báo cáo.'}
          </small>
        </div>
      </div>
      {!data ? (
        failed ? <LoadError text="Không tải được mức độ sử dụng." onRetry={reload} /> : <p role="status">Đang tải...</p>
      ) : (
        <>
          {failed && <LoadError text="Không tải được khoảng này, đang hiện số liệu trước đó." onRetry={reload} />}
          <Kpis data={data} />
          {data.teams.length === 0 ? <Empty title="Chưa có người dùng nào">Tắt “Chỉ người dùng thật” để xem mọi tài khoản.</Empty> : data.teams.map((t) => <TeamCard key={t.id} team={t} />)}
          {png === 'busy' && (
            <div className="usage-shot-host" aria-hidden="true" inert>
              <div ref={shot} className="usage-shot theme-light">
                <header className="usage-shot-head">
                  <p className="usage-shot-title">Mức độ sử dụng</p>
                  <p>
                    {data.period.label} · Số liệu lúc {clock(loadedAt)} {formatDay(vnDay(loadedAt))}
                    {data.real ? '' : ' · Gồm tài khoản hệ thống và team không tính báo cáo'}
                  </p>
                </header>
                <Kpis data={data} />
                {data.teams.map((t) => (
                  <TeamCard key={t.id} team={t} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
