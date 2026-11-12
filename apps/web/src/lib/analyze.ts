import type { Analysis } from '@cvs/core/analysis/breakdown';
// The reference-video analysis feature (rea-video). Off by default: the /api/analyses routes 404 and the worker
// queue is not created until a deploy sets REA_ANALYZE_ENABLED=1 (Stage 3, once rea-video is installed on the
// worker). Mirrors the worker's reaAnalyzeEnabled (apps/worker/src/analyze.ts); the two tiers read the same env.
export const reaAnalyzeEnabled = (): boolean => process.env.REA_ANALYZE_ENABLED === '1';

// rea-video's `format` is a short label the model may return localized (English or, seen in spikes, Chinese). Map the
// common ones to Vietnamese; fall back to the model's own text when it is something we have not labelled.
const FORMAT_LABELS: Record<string, string> = {
  'product showcase': 'Giới thiệu sản phẩm',
  商品展示: 'Giới thiệu sản phẩm',
  unboxing: 'Mở hộp',
  开箱: 'Mở hộp',
  review: 'Đánh giá',
  测评: 'Đánh giá',
  tutorial: 'Hướng dẫn',
  教程: 'Hướng dẫn',
  ugc: 'UGC',
  vlog: 'Vlog',
  lifestyle: 'Phong cách sống',
  testimonial: 'Lời chứng thực',
  advertisement: 'Quảng cáo',
  广告: 'Quảng cáo',
};

export const formatLabel = (format: string): string => {
  const k = format.trim();
  return FORMAT_LABELS[k.toLowerCase()] ?? FORMAT_LABELS[k] ?? format;
};

/** The format line the result and the History cards show: the Vietnamese reading when the worker made one, else our label, else the model's own text. */
export const analysisFormat = (a: Analysis): string => {
  const f = a.vi?.format || formatLabel(a.format) || 'Video';
  return f.charAt(0).toLocaleUpperCase('vi') + f.slice(1); // the translator may answer in lower case
};

// The role the model gave a shot (rea-video returns English words). Unknown roles are shown as the model wrote them.
const ROLE_LABELS: Record<string, string> = {
  hook: 'Mở đầu',
  intro: 'Giới thiệu',
  detail: 'Chi tiết',
  outro: 'Kết',
  model: 'Người mẫu',
  mood: 'Không khí',
  product: 'Sản phẩm',
  demo: 'Trình diễn',
  feature: 'Tính năng',
  benefit: 'Lợi ích',
  cta: 'Kêu gọi hành động',
  closeup: 'Cận cảnh',
  'close-up': 'Cận cảnh',
  lifestyle: 'Đời thường',
  transition: 'Chuyển cảnh',
  reveal: 'Hé lộ',
  unboxing: 'Mở hộp',
  testimonial: 'Chia sẻ',
  problem: 'Vấn đề',
  solution: 'Giải pháp',
  context: 'Bối cảnh',
  proof: 'Minh chứng',
  payoff: 'Chốt lại',
  info: 'Thông tin',
};

export const roleLabel = (role: string): string => ROLE_LABELS[role.trim().toLowerCase()] ?? role;

/** Seconds as m:ss, rounded to the second (a scene that starts at 4.2 reads 0:04). */
export const clock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A scene's span: seconds with one decimal under a minute (a short clip cuts every second or so, and m:ss would round two scenes to the same second), m:ss beyond. */
export const timeRange = (start: number, end: number): string => (end < 60 ? `${start.toFixed(1)}–${end.toFixed(1)}s` : `${clock(start)}–${clock(end)}`);

/**
 * The scenes to read: adjacent shots the model gave the same role and prompt become one (rea-video cuts per camera shot but describes per beat,
 * so a beat filmed in three cuts came back as three identical scenes), renumbered, with their Vietnamese readings kept in step.
 */
export function mergeShots(a: Analysis): { shots: Analysis['shots']; vi: string[] | undefined } {
  const shots: Analysis['shots'] = [];
  const vi: string[] = [];
  a.shots.forEach((s, i) => {
    const last = shots.at(-1);
    if (last && last.prompt === s.prompt && last.role === s.role) {
      last.end = s.end;
      return;
    }
    shots.push({ ...s, index: shots.length + 1 });
    vi.push(a.vi?.shots[i] ?? '');
  });
  return { shots, vi: a.vi ? vi : undefined };
}

/** Create's free prompt takes at most this many characters from ?prompt= (the create page slices to it). */
const SCRIPT_LIMIT = 2000;

/** Every shot's English prompt in order as one free prompt for Create. Whole shots only: it stops before the one that would pass the limit rather than cut a prompt mid-sentence. */
export const scriptPrompt = (shots: Analysis['shots']): string => {
  const lines: string[] = [];
  let length = 0;
  for (const s of shots) {
    if (!s.prompt) continue;
    const line = `Shot ${s.index} (${timeRange(s.start, s.end)}): ${s.prompt}`;
    if (lines.length > 0 && length + 1 + line.length > SCRIPT_LIMIT) break;
    lines.push(line);
    length += (lines.length > 1 ? 1 : 0) + line.length;
  }
  return lines.join('\n');
};
