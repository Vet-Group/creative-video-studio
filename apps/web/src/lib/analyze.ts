import { type Analysis, mergeShots } from '@cvs/core/analysis/breakdown';
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

// The scene merge lives in core, as Smart Remake's API and worker remake a whole scene too.
export { mergeShots };

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

/** The whole breakdown as plain text to paste elsewhere: the format and hook, then a block per scene with its Vietnamese reading (when the worker made one) and English prompt. */
export function scriptText(a: Analysis): string {
  const { shots, vi } = mergeShots(a);
  const hook = a.vi?.hook || a.hook;
  const blocks = shots.map((s, i) => [`Cảnh ${s.index} (${timeRange(s.start, s.end)})${s.role ? ` · ${roleLabel(s.role)}` : ''}`, vi?.[i], s.prompt && `Prompt: ${s.prompt}`].filter(Boolean).join('\n'));
  return [[`Định dạng: ${analysisFormat(a)}`, hook && `Mở đầu: ${hook}`].filter(Boolean).join('\n'), ...blocks].join('\n\n');
}

/** The stored shots (as Smart Remake takes them) of the scenes a scene pick answered with, as 1-based scene numbers in `options`: unknown numbers are dropped, and at most `max` are kept. */
export const scenePicks = (first: number[], options: string[], max: number): number[] => options.map(Number).filter((n) => Number.isInteger(n) && first[n - 1] !== undefined).map((n) => first[n - 1]!).slice(0, max);

/** Where a scene's thumbnail is taken: just inside its start (the first frame can still be the previous cut), and never past its middle. */
export const frameTime = (start: number, end: number): number => start + Math.min(0.3, Math.max(0, end - start) / 2);

/** The times a scene's thumbnail is chosen from: just inside its start, its middle and just inside its end, without repeats (a short scene has fewer). */
export const frameTimes = (start: number, end: number): number[] => {
  const len = Math.max(0, end - start);
  return [...new Set([frameTime(start, end), start + len / 2, end - Math.min(0.3, len / 2)].map((t) => Math.round(t * 100) / 100))];
};

/** How sharp a still is: the variance of its grey Laplacian, so a blurred, moving or mid-cut frame scores lower. `px` is RGBA, as a canvas gives it. */
export function sharpness(px: Uint8ClampedArray, width: number, height: number): number {
  const grey = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
  };
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const l = grey(x - 1, y) + grey(x + 1, y) + grey(x, y - 1) + grey(x, y + 1) - 4 * grey(x, y);
      sum += l;
      sq += l * l;
      n++;
    }
  return n ? sq / n - (sum / n) ** 2 : 0;
}
