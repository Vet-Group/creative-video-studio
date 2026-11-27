'use client';
// The Apps index: a search box, the category chips and a card for each app. `uses` is each app's Runs of the last 7 days by slug (lib/popular.ts).
import Link from 'next/link';
import { useId, useState } from 'react';
import { type AppCategory, type AppConfig, CATEGORIES, filterApps, isNewApp } from '@/lib/apps';
import { usesLine } from '@/lib/popular';
import { useHydrated } from '@/lib/use-hydrated';
import { AppArt } from './AppPage';
import { Icon } from './Icon';
import { useSmartRemakeEnabled } from './SmartRemakeGate';
import { PageHint } from './ToolGuide';

export function AppsIndex({ extra = [], uses = {} }: { extra?: AppConfig[]; uses?: Record<string, number> }) {
  const [category, setCategory] = useState<AppCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const searchId = useId();
  const apps = filterApps(category, search, useSmartRemakeEnabled(), extra);
  const hydrated = useHydrated(); // the New badge reads the viewer's clock, so the server leaves it out
  return (
    <section aria-labelledby="apps-title" className="apps">
      <h1 id="apps-title">Ứng dụng</h1>
      <p className="muted apps-sub">Công cụ AI một chạm cho ảnh và video của công ty.</p>
      <PageHint href="/apps" />
      <div className="apps-tools">
        <div className="apps-search">
          <label htmlFor={searchId} className="sr-only">
            Tìm ứng dụng
          </label>
          <Icon name="search" size={16} />
          <input id={searchId} type="search" value={search} placeholder="Tìm ứng dụng..." onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="kinds kinds-wrap" role="group" aria-label="Danh mục">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {apps.length === 0 ? (
        <p className="muted" role="status">
          Không có ứng dụng nào khớp.
        </p>
      ) : (
        <ul className="apps-grid" aria-label="Danh sách ứng dụng">
          {apps.map((a, i) => (
            <li key={a.slug}>
              <Link href={`/apps/${a.slug}`} className="app-card">
                {/* The first two rows at 1440 px keep their posters eager: the page's largest paint is one of them. */}
                <AppArt app={a} lazy={i >= 6} />
                <span className="app-card-head">
                  <strong>{a.name}</strong>
                  {a.soon ? <span className="badge-soon">Sắp có</span> : hydrated && isNewApp(a) && <span className="badge-soon badge-new">Mới</span>}
                </span>
                <span className="muted">{a.description}</span>
                {usesLine(uses[a.slug]) && <span className="muted app-card-uses">{usesLine(uses[a.slug])}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
