import { dailyClips } from '@cvs/core/limits';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CardMedia } from '@/components/CardMedia';
import { ExploreJobNote } from '@/components/ExploreJobNote';
import { Icon, type IconName } from '@/components/Icon';
import { KindChip } from '@/components/KindChip';
import { ToolGuideButton } from '@/components/ToolGuide';
import { Welcome } from '@/components/Welcome';
import { MODEL_CARD_TEXT } from '@/lib/about-content';
import { thumbUrl } from '@/lib/api';
import { pool } from '@/lib/auth';
import { NO_CAP } from '@/lib/caps';
import { CHANGELOG } from '@/lib/changelog';
import { visibleEntries } from '@/lib/changelog-seen';
import { bestClips } from '@/lib/clips';
import { currentUser } from '@/lib/current-user';
import { cardSample, EXAMPLES, exampleForPreset, sampleSrc } from '@/lib/examples';
import { continueJobs, greeting, isRunning, jobNote } from '@/lib/explore';
import { featureLabel } from '@/lib/features';
import { MIN_MARKS } from '@/lib/model-marks';
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
  { href: '/marketing-studio', sample: 'feature-marketing-studio', title: 'Marketing Studio', icon: 'megaphone', poster: EXAMPLES[1]!.poster },
  { href: '/apps', sample: 'feature-apps', title: 'Ứng dụng', icon: 'apps', poster: '/artwork/explore-apps.svg' },
  { href: '/library', sample: 'feature-library', title: 'Thư viện', icon: 'library', poster: '/artwork/explore-library.svg' },
];

const TZ = 'Asia/Ho_Chi_Minh';
const fmtDay = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: TZ });
const fmtTime = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDate = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', timeZone: TZ });

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

/** How many video and image models the row shows until "Xem tất cả" (owner, 2026-11-06: about ten featured, the rest one click away). */
const SHOWN = { video: 7, image: 3 };

/** A provider twin (-vertex, -byteplus) shares its model's written description. */
const cardText = (id: string) => MODEL_CARD_TEXT[id] ?? MODEL_CARD_TEXT[id.replace(/-(vertex|byteplus)$/, '')];
const toolText = (href: string) => toolGuide(href)?.oneLine ?? 'Mọi clip và ảnh công ty đã tạo, để xem, tải xuống và chấm điểm.';

/** Explore: the member's start page: a greeting with their day and recent work, then the tools, the enabled models and the company presets, each linking into Create.
 * `?models=all` lists every enabled model instead of the featured few. */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ models?: string | string[] }> }) {
  const allModels = (await searchParams).models === 'all';
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
    pool.query<{ id: string; status: string; error: string | null; feature: string; poster_asset_id: string | null; output_asset_id: string | null; input_id: string | null; resolution: string | null; finished_at: Date | null; created_at: Date; prompt: string | null; model_label: string | null }>(
      `select j.id, j.status, j.error, j.feature, j.poster_asset_id, j.output_asset_id, j.input_asset_ids[1] as input_id, j.params->>'resolution' as resolution, j.finished_at, j.created_at, case when j.feature in ('image', 'video') and j.preset_id is null then j.prompt when j.feature = 'image' then j.params->>'brief' end as prompt, m.label as model_label
         from jobs j left join model_configs m on m.id = j.model
        where j.user_id = $1 and j.deleted_at is null and j.purged_at is null order by j.created_at desc, j.id desc limit 20`,
      [user?.id],
    ),
    dailyClips(pool, user?.id ?? ''),
  ]);
  // One model of each duplicate pair (lib/model-twins.ts); fal's balance lock is not read here, as the cards name no price to lock.
  const offered = await onePerPair(pool, models.rows);
  const news = visibleEntries(CHANGELOG, user?.role === 'admin').slice(0, 3);
  const running = jobs.rows.filter(isRunning).length;
  const recent = continueJobs(jobs.rows);
  const status = [running > 0 && `${running} lượt tạo đang chạy`, today.cap >= NO_CAP ? `Hôm nay bạn đã tạo ${today.today} clip video` : `Hôm nay bạn còn ${Math.max(0, today.cap - today.today)}/${today.cap} clip video`].filter(Boolean).join(' · ');
  /** A recent job's picture: its poster (a clip's first frame, an image's preview), else an image job's result, else the first photo it was given (a running or failed job). */
  const jobPicture = (j: (typeof recent)[number]) => {
    const done = j.status === 'succeeded' ? (j.poster_asset_id ?? (j.resolution ? j.output_asset_id : null)) : null;
    const id = done ?? j.input_id;
    return id ? thumbUrl(id) : null;
  };
  /** The recent-job note props: the finish label and the server-rendered note (shown until the leaf mounts and ticks the elapsed time). */
  const noteProps = (j: (typeof recent)[number]) => {
    const job = { status: j.status, error: j.error, created_at: j.created_at, finished_at: j.finished_at };
    const done = `${fmtTime.format(j.finished_at ?? j.created_at)} · ${fmtDate.format(j.finished_at ?? j.created_at)}`;
    return { job, done, initial: jobNote(job, () => done) };
  };
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
  // The featured few: the recommended model of each kind first, then the row's order; the full list keeps the row's order.
  const lead = (kind: 'video' | 'image') => {
    const of = scored.filter((m) => m.kind === kind);
    return [...of.filter((m) => recommended.has(m.id)), ...of.filter((m) => !recommended.has(m.id))].slice(0, SHOWN[kind]);
  };
  const shown = allModels ? scored : [...lead('video'), ...lead('image')];
  const modelText = (m: (typeof scored)[number]) => cardText(m.id) ?? [m.ratios.join(', '), range(m.durations_sec), m.marks >= MIN_MARKS && `Điểm ${m.score}/100 · ${m.marks} lượt đánh giá`].filter(Boolean).join(' · ');
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
                  <Link href={j.status === 'succeeded' ? `/library?item=${j.id}` : (pageOf(j.feature) ?? '/library')} className="explore-job" data-status={isRunning(j) ? 'running' : j.status}>
                    <span className="explore-job-media">{picture ? <img src={picture} alt="" loading="lazy" decoding="async" /> : <span className="banner-empty" aria-hidden="true" />}</span>
                    <strong>{featureLabel(j.feature)}</strong>
                    {/* What tells two jobs of one tool apart: the model, and the member's own words, as the Library's OWN_PROMPT picks them (a composed prompt is left out). */}
                    {j.model_label && <span className="explore-job-model">{j.model_label}</span>}
                    {j.prompt && <span className="explore-job-prompt" title={j.prompt}>{j.prompt}</span>}
                    <span className="muted">
                      <ExploreJobNote {...noteProps(j)} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {news.length > 0 && (
        <section aria-labelledby="explore-news" className="explore-news">
          <div className="explore-start-head">
            <h2 id="explore-news">Có gì mới</h2>
            <Link href="/changelog" className="link-button">
              Xem tất cả
              <Icon name="right" size={14} />
            </Link>
          </div>
          <ul className="explore-news-list" aria-label="Thay đổi mới nhất">
            {news.map((n) => (
              <li key={n.at}>
                <Link href="/changelog" className="explore-news-item">
                  <KindChip kind={n.kind} />
                  <strong>{n.title}</strong>
                  <span className="muted">{fmtDate.format(new Date(n.at))}</span>
                </Link>
              </li>
            ))}
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
              <span className="muted explore-tool-text" title={toolText(f.href)}>
                {toolText(f.href)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="explore-start-head" id="models">
        <h2>{allModels ? 'Tất cả mô hình' : 'Mô hình nổi bật'}</h2>
        {scored.length > shown.length || allModels ? (
          <Link href={allModels ? '/explore#models' : '/explore?models=all#models'} className="link-button" scroll={false}>
            {allModels ? 'Chỉ xem nổi bật' : `Xem tất cả ${scored.length} mô hình`}
          </Link>
        ) : null}
      </div>
      <p className="muted explore-sub">Mở Tạo video hoặc Tạo ảnh với mô hình đã chọn sẵn.</p>
      {offered.length === 0 ? (
        <p className="muted">Chưa có mô hình nào được bật.</p>
      ) : (
        <ul className={allModels ? 'explore-cards explore-cards-all' : 'explore-cards'} aria-label="Mô hình">
          {shown.map((m) => (
            <li key={m.id}>
              <Link href={`${m.kind === 'video' ? '/create' : '/image-generation'}?model=${encodeURIComponent(m.id)}`} className="explore-card">
                <CardMedia {...media(m.id)} />
                <strong>
                  {m.label}
                  {recommended.has(m.id) && <span className="badge badge-recommended">Đề xuất</span>}
                </strong>
                {/* A short description like the live cards, clamped to three lines; a model without one keeps its spec line, scored only once marked. */}
                <span className="muted explore-card-text" title={modelText(m)}>
                  {modelText(m)}
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
