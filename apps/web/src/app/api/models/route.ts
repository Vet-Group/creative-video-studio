import { ALWAYS_AUDIO, estimateUsd, promptLimit, usdPerSecondFor, usdPerSecondWithVideo } from '@cvs/core/models';
import { capRowOf } from '@cvs/core/limits';
import { videoInputs } from '@cvs/core/providers/fal';
import { ASPECTS } from '@cvs/db';
import { pool } from '@/lib/auth';
import { modelStats, rank, scoreOf } from '@/lib/model-scores';
import { canServe, onePerPair } from '@/lib/model-twins';
import { falBalance, falCreditUsd, overCredit } from '@/lib/provider-credit';
import { guard } from '@/lib/session';

/** `videoSec` is the length of the reference video, 0 for none: a model that bills it (VIDEO_REF_USD) then prices the Run with it. */
function audioEstimate(r: { provider: string; endpoint: string; usd_per_second: string }, durationSec: number, videoSec: number): string | null {
  const perSecond = usdPerSecondFor({ endpoint: r.endpoint, usdPerSecond: r.usd_per_second }, 'on');
  return perSecond === undefined ? null : r.provider === 'mock' ? '0.0000' : estimateUsd(videoSec > 0 ? usdPerSecondWithVideo(r.endpoint, perSecond, durationSec, videoSec) : perSecond, durationSec);
}

const MONTH = `to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM')`;

/**
 * The video model picker (image models are left out) for a ratio and duration (`?ratio=9:16&durationSec=8`): the enabled models with pass rate, recommendation
 * score and estimated cost, and the model to pre-select: the best score among those that support the choice (the cheaper on a tie), flagged `recommended`
 * unless every supported model scores the same. Pass rate = (seed passes + marked passes) / (seed total + marked total) over every marked clip, deleted or
 * purged ones included; null while nothing is counted. The score also weighs how often real jobs of the model end well (lib/model-scores.ts).
 * `?feature=video`, `marketing` or `motion_control` keeps the models whose `features` lists it (Marketing Studio also accepts ratio 16:9, Motion Control takes only `auto`); without it every enabled video model is listed.
 * `audioEstimateUsd` is the estimate with native audio on, null for a model that cannot make audio; `alwaysAudio` is true for one that cannot be silent (ALWAYS_AUDIO). `endFrame` is true for a model that takes an end frame, `textOnly` for one that runs from the prompt alone, and `audioClips` the reference audio it takes ({ max, seconds }, or null; videoInputs).
 * `videoRefs` is the reference video it takes ({ max, minSec, maxSec, maxMb, maxImages }, or null; videoInputs), and `?videoSec=` the length of the one chosen, which the estimates of the models that bill it then include.
 * `isNew` is true for a model added in the last 14 days (the picker's badge).
 * A duplicate pair is listed as one entry (migration 0078): its ratios, lengths and inputs are those of the pair, `pairIds` its rows, and its provider, estimate and
 * `supported` those of the row the job would run on (servingRow), for which `?endFrame=1` and `?audioClips=` say what the form adds.
 * Of a pair of duplicate models (`twin_of`, migration 0075) one is listed: the cheaper, or the dearer in its place while the cheaper cannot serve (lib/model-twins.ts).
 * `creditUsd` is what the model's provider can still spend (lib/provider-credit.ts; fal only, null otherwise): the picker locks a model whose estimate is over it, and the
 * model to pre-select is never one of those.
 * `monthToDate` is the caller's own total this ICT month, provisional while a job of it has no closing row. `remainingBudgetUsd` is for Admins only.
 */
export async function GET(request: Request) {
  const g = await guard(request, 'member');
  if (g.error) return g.error;
  const q = new URL(request.url).searchParams;
  const ratio = q.get('ratio');
  const durationSec = q.get('durationSec') ? Number(q.get('durationSec')) : NaN;
  const feature = q.get('feature');
  if (feature !== null && !['video', 'marketing', 'motion_control'].includes(feature)) return Response.json({ error: 'feature must be video, marketing or motion_control' }, { status: 400 });
  // Motion Control's output follows the reference video, so its only ratio is 'auto'. Create Video offers each ratio some video schema takes (0037, 0094); `auto` follows the input image, so a model serves it only for a Run with an image.
  const ratios: readonly (string | null)[] = feature === 'marketing' ? [...ASPECTS, '16:9'] : feature === 'motion_control' ? ['auto'] : [...ASPECTS, '16:9', '4:3', '3:4', '21:9', 'auto'];
  if (!ratios.includes(ratio) || !Number.isInteger(durationSec)) {
    return Response.json({ error: 'ratio and durationSec (a whole number) are required' }, { status: 400 });
  }
  const videoSec = q.get('videoSec') === null ? 0 : Math.ceil(Number(q.get('videoSec')));
  if (!Number.isInteger(videoSec) || videoSec < 0 || videoSec > 60) return Response.json({ error: 'videoSec must be a number of seconds from 0 to 60' }, { status: 400 });
  // What the form adds that one row of a duplicate pair may not take, so the entry is priced as the row the job would run on (servingRow).
  const endFrame = q.get('endFrame') === '1';
  const audioClips = q.get('audioClips') === null ? 0 : Number(q.get('audioClips'));
  if (!Number.isInteger(audioClips) || audioClips < 0 || audioClips > 20) return Response.json({ error: 'audioClips must be a whole number from 0 to 20' }, { status: 400 });
  const images = q.get('images') === null ? 0 : Number(q.get('images'));
  if (!Number.isInteger(images) || images < 0 || images > 20) return Response.json({ error: 'images must be a whole number from 0 to 20' }, { status: 400 });
  const userId = g.session.user.id;
  // `auto` follows the input image, so a Run with none cannot ask for it (Motion Control's own `auto` follows its reference video).
  const followsImage = ratio !== 'auto' || feature === 'motion_control' || images > 0;

  const fal = await falBalance();
  const [models, mine, budget, stats, falCredit] = await Promise.all([
    pool.query(
      `select m.id, m.label, m.provider, m.endpoint, m.ratios, m.durations_sec, m.max_images, m.max_prompt_chars, m.usd_per_second, m.output_resolution,
              m.created_at > now() - interval '14 days' as is_new, m.twin_of
         from model_configs m
        where m.enabled and m.kind = 'video' and ($1::text is null or $1 = any(m.features)) order by m.label, m.id`,
      [feature],
    ),
    pool.query(
      `with m as (select job_id, sum(usd) as usd from cost_entries where user_id = $1 and month = ${MONTH} group by job_id)
       select coalesce(sum(m.usd), 0)::numeric(12, 4)::text as usd, coalesce(bool_or(not c.is_final), false) as provisional from m left join job_costs c on c.job_id = m.job_id`,
      [userId],
    ),
    g.session.user.role === 'admin'
      ? pool.query(`select (s.monthly_cap_usd - coalesce((select sum(usd) from cost_entries ce where month = ${MONTH} and ${capRowOf('ce')} and not exists (select 1 from jobs j where j.id = ce.job_id and j.feature not in ('video', 'marketing'))), 0))::text as remaining from settings s where s.id = 1`)
      : undefined,
    modelStats(null),
    falCreditUsd(pool, fal),
  ]);

  // One model of each duplicate pair: the dearer one only while its twin cannot serve (lib/model-twins.ts); a fal twin is locked by the same estimate the picker shows.
  const offered = await onePerPair(pool, models.rows, (v) => overCredit(v.provider, estimateUsd(v.usd_per_second, durationSec), falCredit));
  const list = offered.map((r) => {
    const st = stats.get(r.id) ?? { passes: 0, total: 0, ok: 0, bad: 0 };
    // A pair acts as one model (migration 0078): the listed row takes on what its enabled twins add, and is priced as the row the job would run on (servingRow).
    // The twins taking the most images first, as servingRow orders them.
    const pair = [r, ...models.rows.filter((t) => t.twin_of === r.id).sort((a, b) => b.max_images - a.max_images || a.id.localeCompare(b.id))];
    const need = { durationSec, ratio: ratio!, images, video: videoSec > 0, audioClips, endFrame };
    // Whether the entry makes this ratio and length at all; what the form adds only picks the row (the form leaves out what the chosen model does not take).
    const plain = { ...need, images: 0, video: false, audioClips: 0, endFrame: false, audio: false };
    const serving = pair.find((p) => canServe(p, { ...need, audio: false })) ?? pair.find((p) => canServe(p, plain)) ?? r;
    const voiced = pair.find((p) => canServe(p, { ...need, audio: true })) ?? serving;
    // What the form may add (an end frame, audio clips, a reference video) comes from the rows that make this ratio and length.
    // With the form's images too: a twin that takes an end frame but fewer images cannot run this job (servingRow), so it offers nothing.
    const fit = pair.filter((p) => p.ratios.includes(ratio) && p.durations_sec.includes(durationSec) && images <= p.max_images);
    const takes = (fit.length > 0 ? fit : [r]).map((p) => videoInputs(p.endpoint));
    const ratios = [...new Set(pair.flatMap((p) => p.ratios as string[]))];
    const durations = [...new Set(pair.flatMap((p) => p.durations_sec as number[]))].sort((a, b) => a - b);
    return {
      id: r.id as string,
      label: r.label as string,
      provider: serving.provider as string,
      isMock: r.provider === 'mock',
      ratios,
      durationsSec: durations,
      maxImages: Math.max(...pair.map((p) => p.max_images as number)),
      maxPromptChars: promptLimit(r.max_prompt_chars),
      resolution: r.output_resolution as string | null,
      isNew: r.is_new as boolean,
      // A mock job books 0 USD, so that is what the picker shows for it.
      estimateUsd: r.provider === 'mock' ? '0.0000' : estimateUsd(videoSec > 0 ? usdPerSecondWithVideo(serving.endpoint, serving.usd_per_second, durationSec, videoSec) : serving.usd_per_second, durationSec),
      // With native audio on (Marketing Studio Advanced); null when the endpoint cannot make audio.
      audioEstimateUsd: audioEstimate(voiced, durationSec, videoSec),
      alwaysAudio: ALWAYS_AUDIO.has(serving.endpoint) && ALWAYS_AUDIO.has(voiced.endpoint),
      ...takes[0],
      endFrame: takes.some((t) => t.endFrame),
      endMaxSec: takes.find((t) => t.endFrame)?.endMaxSec ?? null,
      textOnly: takes.some((t) => t.textOnly),
      audioClips: takes.find((t) => t.audioClips !== null)?.audioClips ?? null,
      videoRefs: takes.find((t) => t.videoRefs !== null)?.videoRefs ?? null,
      ...scoreOf(st),
      passes: st.passes,
      total: st.total,
      supported: followsImage && pair.some((p) => canServe(p, plain)),
      // The rows of its pair, so a form reusing a job made on a twin keeps this entry.
      pairIds: pair.map((p) => p.id as string),
      creditUsd: serving.provider === 'fal' ? falCredit : null,
      creditShown: g.session.user.role === 'admin', // members see that a model is out of budget, not the provider's balance
    };
  });
  const supported = list.filter((m) => m.supported && !overCredit(m.provider, m.estimateUsd, m.creditUsd)).map((m) => ({ id: m.id, score: m.score, usd: Number(m.estimateUsd) }));
  const { best, recommended } = rank(supported);
  return Response.json({
    models: list.map((m) => ({ ...m, recommended: m.id === recommended })),
    defaultModelId: best,
    monthToDate: { usd: mine.rows[0].usd, provisional: mine.rows[0].provisional },
    ...(budget && { remainingBudgetUsd: budget.rows[0].remaining }),
  });
}
