import Link from 'next/link';
import { CardMedia } from '@/components/CardMedia';
import { Icon } from '@/components/Icon';
import { MODEL_CARD_TEXT } from '@/lib/about-content';
import { pool } from '@/lib/auth';
import { cardSample, EXAMPLES, exampleForPreset, sampleSrc } from '@/lib/examples';
import { modelStats, rank, scoreOf } from '@/lib/model-scores';
import { listSamples } from '@/lib/samples';

// The tools the app has, in the live sidebar order; uploaded samples override these fallback posters.
const FEATURES = [
  { href: '/try-on', sample: 'feature-try-on', title: 'Thử đồ', text: 'Mặc trang phục lên người mẫu từ ảnh, giữ nguyên người và bối cảnh.', poster: EXAMPLES[2]!.poster },
  { href: '/image-generation', sample: 'feature-image-generation', title: 'Tạo ảnh', text: 'Tạo hoặc chỉnh ảnh sản phẩm từ ảnh tham chiếu và một mô tả.', poster: EXAMPLES[3]!.poster },
  { href: '/create', sample: 'feature-create-videos', title: 'Tạo video', text: 'Biến ảnh sản phẩm thành video ngắn bằng các mô hình AI.', poster: EXAMPLES[0]!.poster },
  { href: '/marketing-studio', sample: 'feature-marketing-studio', title: 'Marketing Studio', text: 'Tạo video kiểu người sáng tạo nội dung từ ảnh người mẫu và ảnh sản phẩm.', poster: EXAMPLES[0]!.poster },
  { href: '/apps', sample: 'feature-apps', title: 'Ứng dụng', text: 'Đổi nhân vật, đổi nền, xoá nền, phóng to ảnh và các công cụ AI một chạm khác.', poster: '/artwork/explore-apps.svg' },
  { href: '/library', sample: 'feature-library', title: 'Thư viện', text: 'Xem, tải xuống và đánh giá mọi clip của công ty.', poster: '/artwork/explore-library.svg' },
];

/** The sample name of a model card; ids such as seedance-2.5 keep only letters, digits and dashes in sample names.
 * A variant without its own sample (a -vertex, -reference, -replicate, -1080p or -480p id) shows the sample of the model it varies. */
const modelSample = (have: ReadonlySet<string>, id: string) => {
  const own = `model-${id.replace(/[^a-z0-9-]/g, '-')}`;
  for (let base = own, next = ''; ; base = next) {
    if (have.has(`${base}.mp4`) || have.has(`${base}.jpg`)) return base;
    next = base.replace(/-(vertex|reference|replicate|1080p|480p)$/, '');
    if (next === base) return own;
  }
};

/** The live page's featured models, in its order; they lead the row, then the other models with a sample loop, then those with a still, then the rest.
 * seedance-2.5 and seedance-2.0-replicate keep the live order when the -image and base rows are disabled. */
const FEATURED = ['seedance-2.5-image', 'seedance-2.5', 'kling-o3-pro', 'gemini-omni-flash', 'kling-3.0-pro', 'seedance-2.0', 'seedance-2.0-replicate'];

const range = (values: number[]) => (values.length === 0 ? '' : values.length > 1 ? `${Math.min(...values)}–${Math.max(...values)} giây` : `${values[0]} giây`);

/** Explore: the start page of the live dashboard, with the tools, the enabled models and the company presets, each linking into Create. */
export default async function ExplorePage() {
  const [models, presets, samples, videoStats, imageStats] = await Promise.all([
    // Video models open Create Videos and image models open Image Generation, as the live page features both.
    pool.query<{ id: string; label: string; provider: string; kind: string; ratios: string[]; durations_sec: number[]; usd_per_second: string | null; image_prices: Record<string, string> | null }>(
      `select id, label, provider, kind, ratios, durations_sec, usd_per_second, image_prices from model_configs where enabled and kind = any(features) and kind in ('video', 'image') order by kind desc, label, id`,
    ),
    pool.query<{ id: string; label: string }>('select id, label from presets where enabled order by sort_order, id'),
    listSamples().catch(() => []), // without the bucket the page keeps its fallbacks
    // The same scores as the pickers: every mark for a video model, the Image Generation marks for an image model.
    modelStats(null),
    modelStats('image'),
  ]);
  const have = new Set(samples.map((s) => s.name));
  const scored = models.rows.map((m) => {
    const st = (m.kind === 'video' ? videoStats : imageStats).get(m.id) ?? { passes: 0, total: 0, ok: 0, bad: 0 };
    const usd = m.kind === 'video' ? Number(m.usd_per_second ?? 0) : Math.min(...Object.values(m.image_prices ?? {}).map(Number));
    return { ...m, score: scoreOf(st).score, marks: st.total, usd };
  });
  const rankOf = (id: string) => {
    const featured = FEATURED.indexOf(id);
    if (featured >= 0) return featured;
    const media = cardSample(have, modelSample(have, id));
    return FEATURED.length + (media.video ? 0 : media.poster ? 1 : 2);
  };
  scored.sort((a, b) => rankOf(a.id) - rankOf(b.id)); // stable: within a group the query's kind and label order stays
  const recommended = new Set(['video', 'image'].map((kind) => rank(scored.filter((m) => m.kind === kind)).recommended));
  return (
    <div className="explore">
      <h1>Bắt đầu sáng tạo</h1>
      <ul className="explore-features" aria-label="Công cụ">
        {FEATURES.map((f) => (
          <li key={f.href}>
            <Link href={f.href} className="explore-feature">
              <CardMedia {...cardSample(have, f.sample, f.poster)} />
              <span className="explore-feature-head">
                <strong>{f.title}</strong>
                <span className="explore-arrow" aria-hidden="true">
                  <Icon name="arrow" size={16} />
                </span>
              </span>
              <span className="muted">{f.text}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2>Mô hình nổi bật</h2>
      {models.rows.length === 0 ? (
        <p className="muted">Chưa có mô hình nào được bật.</p>
      ) : (
        <ul className="explore-cards" aria-label="Mô hình">
          {scored.map((m) => (
            <li key={m.id}>
              <Link href={`${m.kind === 'video' ? '/create' : '/image-generation'}?model=${encodeURIComponent(m.id)}`} className="explore-card">
                <CardMedia {...cardSample(have, modelSample(have, m.id))} always />
                <strong>
                  {m.label}
                  {recommended.has(m.id) && <span className="badge badge-recommended">Đề xuất</span>}
                </strong>
                {/* A short description like the live cards, clamped to three lines; a model without one keeps its spec line. */}
                <span className="muted explore-card-text">
                  {MODEL_CARD_TEXT[m.id] ?? [m.ratios.join(', '), range(m.durations_sec), `Điểm ${m.score}/100`, m.marks > 0 && `${m.marks} lượt đánh giá`].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2>Mẫu chuyển động</h2>
      <p className="muted explore-sub">Chọn một mẫu, tải ảnh đầu lên và nhận video.</p>
      {/* A masonry of looping tiles like the live page: the name and a Create button show on hover or focus. The first tile is the free prompt. */}
      <ul className="explore-prompts" aria-label="Mẫu">
        {[{ id: 'none', label: 'Tự viết mô tả', sample: 'preset-general' }, ...presets.rows.map((p) => ({ ...p, sample: `preset-${p.id}` }))].map((p) => {
          const ex = exampleForPreset(p.id);
          const media = cardSample(have, p.sample, ex ? sampleSrc(have, ex.poster) : null);
          return (
            <li key={p.id}>
              <Link href={`/create?preset=${encodeURIComponent(p.id)}`} className="explore-prompt" aria-label={p.label}>
                <CardMedia video={media.video ?? (ex ? sampleSrc(have, ex.src) : null)} poster={media.poster} always />
                <span className="explore-prompt-hover" aria-hidden="true">
                  <strong>{p.label}</strong>
                  <span className="explore-prompt-go">
                    <Icon name="create" size={16} />
                    Tạo
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
