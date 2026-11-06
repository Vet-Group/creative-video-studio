import { dailyClips } from '@cvs/core/limits';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CardMedia } from '@/components/CardMedia';
import { Icon, type IconName } from '@/components/Icon';
import { ToolGuideButton } from '@/components/ToolGuide';
import { Welcome } from '@/components/Welcome';
import { MODEL_CARD_TEXT } from '@/lib/about-content';
import { pool } from '@/lib/auth';
import { bestClips } from '@/lib/clips';
import { currentUser } from '@/lib/current-user';
import { cardSample, EXAMPLES, exampleForPreset, sampleSrc } from '@/lib/examples';
import { continueJobs, greeting, isRunning } from '@/lib/explore';
import { featureLabel } from '@/lib/features';
import { modelStats, rank, scoreOf } from '@/lib/model-scores';
import { onePerPair } from '@/lib/model-twins';
import { pageOf } from '@/lib/reuse';
import { listSamples } from '@/lib/samples';
import { TOOL_GOALS, toolGuide } from '@/lib/tool-guide';

// The tools the app has, in the live sidebar order; uploaded samples override these fallback posters.
const FEATURES: { href: string; sample: string; title: string; icon: IconName; poster: string }[] = [
  { href: '/try-on', sample: 'feature-try-on', title: 'Thử đồ', icon: 'tryon', poster: EXAMPLES[2]!.poster },
  { href: '/image-generation', sample: 'feature-image-generation', title: 'Tạo ảnh', icon: 'image', poster: EXAMPLES[3]!.poster },
  { href: '/create', sample: 'feature-create-videos', title: 'Tạo video', icon: 'create', poster: EXAMPLES[0]!.poster },
  { href: '/marketing-studio', sample: 'feature-marketing-studio', title: 'Marketing Studio', icon: 'megaphone', poster: EXAMPLES[0]!.poster },
  { href: '/apps', sample: 'feature-apps', title: 'Ứng dụng', icon: 'apps', poster: '/artwork/explore-apps.svg' },
  { href: '/library', sample: 'feature-library', title: 'Thư viện', icon: 'library', poster: '/artwork/explore-library.svg' },
];

const TZ = 'Asia/Ho_Chi_Minh';
const fmtDay = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: TZ });
const fmtTime = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDate = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', timeZone: TZ });
const content = (id: string) => `/api/assets/${id}/content`;

/** The sample name of a model card; ids such as seedance-2.5 keep only letters, digits and dashes in sample names.
 * A variant without its own sample (a -vertex, -reference, -byteplus, -1080p or -480p id) shows the sample of the model it varies. */
const modelSample = (have: ReadonlySet<string>, id: string) => {
  const own = `model-${id.replace(/[^a-z0-9-]/g, '-')}`;
  for (let base = own, next = ''; ; base = next) {
    if (have.has(`${base}.mp4`) || have.has(`${base}.jpg`)) return base;
    next = base.replace(/-(vertex|reference|byteplus|1080p|480p)$/, '');
    if (next === base) return own;
  }
};

/** The live page's featured models, in its order; they lead the row, then the other models with a loop (Library clip or sample), then those with a still, then the rest.
 * seedance-2.5 and seedance-2.0-byteplus keep the live order when the -image and base rows are disabled. */
const FEATURED = ['seedance-2.5-image', 'seedance-2.5', 'kling-o3-pro', 'gemini-omni-flash', 'kling-3.0-pro', 'seedance-2.0', 'seedance-2.0-byteplus'];

const range = (values: number[]) => (values.length === 0 ? '' : values.length > 1 ? `${Math.min(...values)}–${Math.max(...values)} giây` : `${values[0]} giây`);

/** Explore: the member's start page: a greeting with their day and recent work, then the tools, the enabled models and the company presets, each linking into Create. */
export default async function ExplorePage() {
  // The (app) layout does not rerun on a client navigation, so a page that reads data itself checks the forced password change again.
  const user = await currentUser();
  if (user?.mustChangePassword) redirect('/account/password');
  const now = new Date();
  const [models, presets, samples, videoStats, imageStats, clips, jobs, today] = await Promise.all([
    // Video models open Create Videos and image models open Image Generation, as the live page features both.
    pool.query<{ id: string; label: string; provider: string; kind: string; ratios: string[]; durations_sec: number[]; usd_per_second: string | null; image_prices: Record<string, string> | null; twin_of: string | null }>(
      `select id, label, provider, kind, ratios, durations_sec, usd_per_second, image_prices, twin_of from model_configs where enabled and kind = any(features) and kind in ('video', 'image') order by kind desc, label, id`,
    ),
    pool.query<{ id: string; label: string }>(`select id, label from presets where feature = 'video' and enabled order by sort_order, id`),
    listSamples().catch(() => []), // without the bucket the page keeps its fallbacks
    // The same scores as the pickers: every mark for a video model, the Image Generation marks for an image model.
    modelStats(null),
    modelStats('image'),
    bestClips(),
    // shortcut: a running job older than the latest 20 is left out, as the jobs tray leaves it; widen if members queue that many.
    pool.query<{ id: string; status: string; feature: string; poster_asset_id: string | null; output_asset_id: string | null; input_id: string | null; resolution: string | null; finished_at: Date | null; created_at: Date }>(
      `select id, status, feature, poster_asset_id, output_asset_id, input_asset_ids[1] as input_id, params->>'resolution' as resolution, finished_at, created_at
         from jobs where user_id = $1 and deleted_at is null and purged_at is null order by created_at desc, id desc limit 20`,
      [user?.id],
    ),
    dailyClips(pool, user?.id ?? ''),
  ]);
  // One model of each duplicate pair (lib/model-twins.ts); fal's balance lock is not read here, as the cards name no price to lock.
  const offered = await onePerPair(pool, models.rows);
  const running = jobs.rows.filter(isRunning).length;
  const recent = continueJobs(jobs.rows);
  const status = [running > 0 && `${running} job đang chạy`, `Hôm nay bạn còn ${Math.max(0, today.cap - today.today)}/${today.cap} clip video`].filter(Boolean).join(' · ');
  /** A recent job's picture: an image job's result, a clip's poster, else the first photo it was given (a running or failed job). */
  const jobPicture = (j: (typeof recent)[number]) => {
    const done = j.status === 'succeeded' ? (j.resolution ? j.output_asset_id : j.poster_asset_id) : null;
    const id = done ?? j.input_id;
    return id ? content(id) : null;
  };
  const jobNote = (j: (typeof recent)[number]) => (isRunning(j) ? 'Đang tạo' : j.status === 'succeeded' ? `${fmtTime.format(j.finished_at ?? j.created_at)} · ${fmtDate.format(j.finished_at ?? j.created_at)}` : 'Không thành công');
  const have = new Set(samples.map((s) => s.name));
  /** A model's card picture: the company's best Library clip of it, else its uploaded sample; a clip without a poster keeps the sample's still. */
  const media = (id: string) => {
    const sample = cardSample(have, modelSample(have, id)), clip = clips.get(id);
    return clip ? { video: clip.video, poster: clip.poster ?? sample.poster } : sample;
  };
  const scored = offered.map((m) => {
    const st = (m.kind === 'video' ? videoStats : imageStats).get(m.id) ?? { passes: 0, total: 0, ok: 0, bad: 0 };
    const usd = m.kind === 'video' ? Number(m.usd_per_second ?? 0) : Math.min(...Object.values(m.image_prices ?? {}).map(Number));
    return { ...m, score: scoreOf(st).score, marks: st.total, usd };
  });
  const rankOf = (id: string) => {
    const featured = FEATURED.indexOf(id);
    if (featured >= 0) return featured;
    const shown = media(id);
    return FEATURED.length + (shown.video ? 0 : shown.poster ? 1 : 2);
  };
  scored.sort((a, b) => rankOf(a.id) - rankOf(b.id)); // stable: within a group the query's kind and label order stays
  const recommended = new Set(['video', 'image'].map((kind) => rank(scored.filter((m) => m.kind === kind)).recommended));
  return (
    <div className="explore">
      <header className="explore-hero">
        <p className="explore-slate">
          <span className="explore-dot" data-live={running > 0} aria-hidden="true" />
          {fmtDay.format(now)}
        </p>
        <h1>{greeting(user?.name, now)}</h1>
        <p className="explore-status">{status}</p>
        {recent.length === 0 && <Welcome />}
        {recent.length === 0 && <p className="muted explore-first">Bạn chưa tạo clip hay ảnh nào. Chọn một công cụ bên dưới: tải ảnh sản phẩm lên, chọn mẫu và nhận kết quả sau vài phút.</p>}
      </header>

      {recent.length > 0 && (
        <section aria-labelledby="explore-continue">
          <h2 id="explore-continue">Tiếp tục</h2>
          <p className="muted explore-sub">Việc bạn đang chạy và vừa làm xong.</p>
          <ul className="explore-jobs" aria-label="Việc gần đây">
            {recent.map((j) => {
              const picture = jobPicture(j);
              return (
                <li key={j.id}>
                  <Link href={pageOf(j.feature) ?? '/library'} className="explore-job" data-status={isRunning(j) ? 'running' : j.status}>
                    <span className="explore-job-media">{picture ? <img src={picture} alt="" /> : <span className="banner-empty" aria-hidden="true" />}</span>
                    <strong>{featureLabel(j.feature)}</strong>
                    <span className="muted">{jobNote(j)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="explore-start" className="explore-start">
        <div className="explore-start-head">
          <h2 id="explore-start">Bắt đầu từ đâu</h2>
          <ToolGuideButton className="link-button">So sánh các công cụ</ToolGuideButton>
        </div>
        <p className="muted explore-sub">Chọn việc bạn cần; mỗi dòng mở đúng công cụ.</p>
        <ul className="tool-goals" aria-label="Bắt đầu từ đâu">
          {TOOL_GOALS.map((g) => (
            <li key={g.need}>
              <Link href={g.href}>
                <span>{g.need}</span>
                <strong>
                  {g.go}
                  <Icon name="right" size={14} />
                </strong>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <h2>Công cụ</h2>
      <ul className="explore-tools" aria-label="Công cụ">
        {FEATURES.map((f) => (
          <li key={f.href}>
            <Link href={f.href} className="explore-tool">
              <CardMedia {...cardSample(have, f.sample, f.poster)} />
              <span className="explore-tool-name">
                <Icon name={f.icon} size={16} />
                <strong>{f.title}</strong>
              </span>
              <span className="muted explore-tool-text">{toolGuide(f.href)?.oneLine ?? 'Mọi clip và ảnh công ty đã tạo, để xem, tải xuống và chấm điểm.'}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2>Mô hình nổi bật</h2>
      <p className="muted explore-sub">Mở Tạo video hoặc Tạo ảnh với mô hình đã chọn sẵn.</p>
      {offered.length === 0 ? (
        <p className="muted">Chưa có mô hình nào được bật.</p>
      ) : (
        <ul className="explore-cards" aria-label="Mô hình">
          {scored.map((m) => (
            <li key={m.id}>
              <Link href={`${m.kind === 'video' ? '/create' : '/image-generation'}?model=${encodeURIComponent(m.id)}`} className="explore-card">
                <CardMedia {...media(m.id)} />
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
          const ex = exampleForPreset(p.id, have);
          const media = cardSample(have, p.sample, ex ? sampleSrc(have, ex.poster) : null);
          return (
            <li key={p.id}>
              <Link href={`/create?preset=${encodeURIComponent(p.id)}`} className="explore-prompt" aria-label={p.label}>
                <CardMedia video={media.video ?? (ex ? sampleSrc(have, ex.src) : null)} poster={media.poster} />
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
