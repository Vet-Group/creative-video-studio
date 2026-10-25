import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { pool } from '@/lib/auth';
import { EXAMPLES, exampleForPreset, sampleSrc } from '@/lib/examples';
import { listSamples } from '@/lib/samples';

// The tools the app has, in the live sidebar order; each later tool adds its card here. Posters are the fixture clips until real ones exist.
const FEATURES = [
  { href: '/try-on', sample: 'feature-try-on.jpg', title: 'Thử đồ', text: 'Mặc trang phục lên người mẫu từ ảnh, giữ nguyên người và bối cảnh.', poster: EXAMPLES[2]!.poster },
  { href: '/image-generation', sample: 'feature-image-generation.jpg', title: 'Tạo ảnh', text: 'Tạo hoặc chỉnh ảnh sản phẩm từ ảnh tham chiếu và một mô tả.', poster: EXAMPLES[3]!.poster },
  { href: '/create', sample: 'feature-create-videos.jpg', title: 'Tạo video', text: 'Biến ảnh sản phẩm thành video ngắn bằng các mô hình AI.', poster: EXAMPLES[0]!.poster },
  { href: '/marketing-studio', sample: 'feature-marketing-studio.jpg', title: 'Marketing Studio', text: 'Tạo video kiểu người sáng tạo nội dung từ ảnh người mẫu và ảnh sản phẩm.', poster: EXAMPLES[0]!.poster },
  { href: '/apps', sample: 'feature-apps.jpg', title: 'Ứng dụng', text: 'Đổi nhân vật, đổi nền, xoá nền, phóng to ảnh và các công cụ AI một chạm khác.', poster: EXAMPLES[1]!.poster },
  { href: '/library', sample: 'feature-library.jpg', title: 'Thư viện', text: 'Xem, tải xuống và đánh giá mọi clip của công ty.', poster: EXAMPLES[1]!.poster },
];

/** The sample image of a model card; ids such as seedance-2.5 keep only letters, digits and dashes in sample names. */
const modelSample = (id: string) => `model-${id.replace(/[^a-z0-9-]/g, '-')}.jpg`;

const range = (values: number[]) => (values.length === 0 ? '' : values.length > 1 ? `${Math.min(...values)}–${Math.max(...values)} giây` : `${values[0]} giây`);

/** Explore: the start page of the live dashboard, with the tools, the enabled models and the company presets, each linking into Create. */
export default async function ExplorePage() {
  const [models, presets, samples] = await Promise.all([
    // Video models open Create Videos and image models open Image Generation, as the live page features both.
    pool.query<{ id: string; label: string; provider: string; kind: string; ratios: string[]; durations_sec: number[] }>(
      `select id, label, provider, kind, ratios, durations_sec from model_configs where enabled and kind = any(features) and kind in ('video', 'image') order by kind desc, label, id`,
    ),
    pool.query<{ id: string; label: string }>('select id, label from presets where enabled order by sort_order, id'),
    listSamples().catch(() => []), // without the bucket the page keeps its fallbacks
  ]);
  const have = new Set(samples.map((s) => s.name));
  return (
    <div className="explore">
      <h1>Bắt đầu sáng tạo</h1>
      <ul className="explore-features" aria-label="Công cụ">
        {FEATURES.map((f) => (
          <li key={f.href}>
            <Link href={f.href} className="explore-feature">
              <img src={sampleSrc(have, f.poster, f.sample)} alt="" />
              <span className="explore-feature-head">
                <strong>{f.title}</strong>
                <span className="explore-arrow" aria-hidden="true">
                  <Icon name="external" />
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
          {models.rows.map((m) => (
            <li key={m.id}>
              <Link href={m.kind === 'video' ? `/create?model=${encodeURIComponent(m.id)}` : '/image-generation'} className="explore-card">
                {have.has(modelSample(m.id)) ? <img src={`/api/samples/${modelSample(m.id)}`} alt="" /> : <span className="banner-empty" aria-hidden="true" />}
                <strong>{m.label}</strong>
                <span className="muted">
                  {[m.ratios.join(', '), range(m.durations_sec)].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2>Mẫu chuyển động</h2>
      <p className="muted explore-sub">Chọn một mẫu, tải ảnh đầu lên và nhận video.</p>
      {presets.rows.length === 0 ? (
        <p className="muted">Chưa có mẫu nào được bật.</p>
      ) : (
        <ul className="explore-cards" aria-label="Mẫu">
          {presets.rows.map((p) => {
            const ex = exampleForPreset(p.id);
            return (
              <li key={p.id}>
                <Link href={`/create?preset=${encodeURIComponent(p.id)}`} className="explore-card">
                  {ex ? <img src={sampleSrc(have, ex.poster)} alt="" /> : <span className="banner-empty" aria-hidden="true" />}
                  <strong>{p.label}</strong>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
