'use client';
// The Apps index: a search box, the category chips and a card for each app.
import Link from 'next/link';
import { useId, useState } from 'react';
import { type AppCategory, CATEGORIES, filterApps } from '@/lib/apps';
import { AppArt } from './AppPage';
import { Icon } from './Icon';

export function AppsIndex() {
  const [category, setCategory] = useState<AppCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const searchId = useId();
  const apps = filterApps(category, search);
  return (
    <section aria-labelledby="apps-title" className="apps">
      <h1 id="apps-title">Ứng dụng</h1>
      <p className="muted apps-sub">Công cụ AI một chạm cho ảnh và video của công ty.</p>
      <div className="apps-tools">
        <div className="apps-search">
          <label htmlFor={searchId} className="sr-only">
            Tìm ứng dụng
          </label>
          <Icon name="search" size={16} />
          <input id={searchId} type="search" value={search} placeholder="Tìm ứng dụng..." onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="kinds" role="group" aria-label="Danh mục">
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
          {apps.map((a) => (
            <li key={a.slug}>
              <Link href={`/apps/${a.slug}`} className="app-card">
                <AppArt app={a} />
                <span className="app-card-head">
                  <strong>{a.name}</strong>
                  {a.soon && <span className="badge-soon">Sắp có</span>}
                </span>
                <span className="muted">{a.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
