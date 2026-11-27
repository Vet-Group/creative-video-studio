'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { api, sendJson, thumbUrl } from '@/lib/api';
import { useAction } from '@/lib/admin-ui';
import { CATEGORIES } from '@/lib/apps';
import { type AppFields, appInputProblem, MAX_APP_DESCRIPTION, MAX_APP_NAME, MAX_SLOT_HINT, MAX_SLOT_LABEL } from '@/lib/custom-apps';
import type { AdminApp, AppSource } from '@/lib/custom-apps-db';
import { PageHead } from './PageHead';
import styles from './AppEditor.module.css';

/** One input of the clip in the form: a slot the member fills, or the clip's own photo kept. */
interface Row {
  fixed: boolean;
  label: string;
  hint: string;
}

/** What the app keeps from the clip, as one line: the model, the ratio, the length or resolution, and the sound of a video. */
const settingsLine = (s: AppSource) =>
  [s.modelLabel, s.ratio, s.feature === 'video' ? `${s.durationS} giây` : s.resolution, s.feature === 'video' ? (s.audio === 'on' ? 'Có âm thanh' : 'Không âm thanh') : null].filter(Boolean).join(' · ');

/** The source clip as the editor shows it, also when it cannot become an app: its result and the settings the app keeps. */
function Original({ source }: { source: AppSource }) {
  return (
    <section aria-labelledby="original-title" className={styles.original}>
      <figure className={styles.preview}>
        {source.feature === 'video' ? (
          <video src={`/api/assets/${source.outputAssetId}/content`} poster={source.posterAssetId ? thumbUrl(source.posterAssetId) : undefined} controls muted preload="none" aria-label="Kết quả gốc" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl(source.outputAssetId)} alt="Kết quả gốc" />
        )}
        <figcaption>Ảnh bìa: kết quả của lượt này</figcaption>
      </figure>
      <div className={styles.facts}>
        <h2 id="original-title">Kết quả gốc</h2>
        <p>{settingsLine(source)}</p>
        <p className="muted">Mô hình, tỉ lệ và thời lượng giữ như lượt gốc.</p>
      </div>
    </section>
  );
}

function EditorForm({ jobId, source, app }: { jobId: string; source: AppSource; app?: AdminApp }) {
  const router = useRouter();
  const { problem, pending, run } = useAction(() => {
    router.push('/admin/apps');
    router.refresh();
  });
  const id = useId();
  const [name, setName] = useState(app?.name ?? '');
  const [description, setDescription] = useState(app?.description ?? '');
  const [category, setCategory] = useState(app?.category ?? '');
  const [prompt, setPrompt] = useState(app?.prompt ?? (typeof source.draft === 'string' ? '' : source.draft.prompt));
  const [published, setPublished] = useState(app?.published ?? false);
  const [rows, setRows] = useState<Row[]>(() =>
    source.inputIds.map((_, n) => {
      const kept = app?.inputs[n];
      return kept && 'slot' in kept ? { fixed: false, ...kept.slot } : { fixed: kept !== undefined, label: `Ảnh ${n + 1}`, hint: '' };
    }),
  );
  const change = (n: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  const fields: AppFields = { name, description, category, prompt, inputs: rows.map((r) => (r.fixed ? { fixed: true } : { slot: { label: r.label, hint: r.hint } })) };
  const reason = appInputProblem(fields, source.inputIds.length, source.maxPromptChars);

  function save(e: FormEvent) {
    e.preventDefault();
    if (reason) return;
    void run(
      () => (app ? api(`/api/admin/apps/${app.id}`, sendJson('PATCH', { ...fields, published })) : api('/api/admin/apps', sendJson('POST', { ...fields, jobId, publish: published }))),
      'Không lưu được ứng dụng.',
    );
  }

  return (
    <form className={styles.form} onSubmit={save} aria-describedby={reason ? `${id}-reason` : undefined}>
      <section aria-labelledby={`${id}-inputs`}>
        <h2 id={`${id}-inputs`}>Ảnh đầu vào</h2>
        <ul className={styles.inputs}>
          {rows.map((r, n) => {
            const photo = source.images.find((i) => i.id === source.inputIds[n]);
            return (
              <li key={n}>
                <fieldset className={styles.input}>
                  <legend>Ảnh {n + 1}</legend>
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.thumb} src={thumbUrl(photo.id)} alt={`Ảnh đầu vào ${n + 1} của lượt gốc`} loading="lazy" />
                  ) : (
                    <span className={styles.thumb} role="img" aria-label={`Ảnh đầu vào ${n + 1} đã bị xoá`} />
                  )}
                  <div className={styles.fields}>
                    <div className={styles.choices}>
                      <label>
                        <input type="radio" name={`${id}-input-${n}`} checked={!r.fixed} onChange={() => change(n, { fixed: false })} />
                        Người dùng tải lên
                      </label>
                      <label>
                        <input type="radio" name={`${id}-input-${n}`} checked={r.fixed} onChange={() => change(n, { fixed: true })} />
                        Giữ cố định
                      </label>
                    </div>
                    {!r.fixed && (
                      <>
                        <label>
                          Tên ô
                          <input value={r.label} maxLength={MAX_SLOT_LABEL} onChange={(e) => change(n, { label: e.target.value })} />
                        </label>
                        <label>
                          Gợi ý trong ô
                          <input value={r.hint} maxLength={MAX_SLOT_HINT} onChange={(e) => change(n, { hint: e.target.value })} />
                        </label>
                      </>
                    )}
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ul>
      </section>
      <label>
        Mô tả gửi cho mô hình
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <span className={styles.counter}>
          {prompt.trim().length}/{source.maxPromptChars}
        </span>
      </label>
      <label>
        Tên ứng dụng
        <input value={name} maxLength={MAX_APP_NAME} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Mô tả ngắn
        <input value={description} maxLength={MAX_APP_DESCRIPTION} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Danh mục
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Chọn danh mục</option>
          {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        Đăng lên trang Ứng dụng ngay
      </label>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {reason && (
        <p id={`${id}-reason`} className="muted">
          {reason}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={pending || reason !== null}>
          Lưu
        </button>
        <Link href="/admin/apps" className="button">
          Huỷ
        </Link>
      </div>
    </form>
  );
}

/** The Admin's form for an app: `source` is the clip it is made from (its result and settings stay the clip's), `app` the row being edited, none for a new one. */
export function AppEditor({ jobId, source, app }: { jobId: string; source: AppSource; app?: AdminApp }) {
  return (
    <section aria-labelledby="app-editor-title">
      <PageHead id="app-editor-title" title={app ? 'Sửa ứng dụng' : 'Biến thành ứng dụng'} lead="Thành viên chỉ tải ảnh lên rồi bấm Chạy; mô tả và cài đặt bên dưới là của ứng dụng." />
      <Original source={source} />
      {typeof source.draft === 'string' ? (
        <>
          <p role="alert">{source.draft}</p>
          <Link href="/library" className="button">
            Về Thư viện
          </Link>
        </>
      ) : (
        <EditorForm jobId={jobId} source={source} app={app} />
      )}
    </section>
  );
}
