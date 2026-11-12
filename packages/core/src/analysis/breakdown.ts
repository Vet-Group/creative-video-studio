// Normalizes a rea-video `breakdown.json` into the shape Creative Video Studio shows and reuses.
//
// Driven off the VLM layer (whole_video_vlm + per-shot narrative). The deterministic verdict /
// material / has_real_material flags are intentionally ignored: on studio and stock apparel footage
// they misclassify (a real live-action clip reads as "3D render" with has_real_material=false), while
// the VLM summary and per-shot narrative stay accurate. rea-video runs with lang=en, so the per-shot
// `point` and the whole-video `summary` are English prompts; `format`/`hook` are display labels the
// Vietnamese UI maps and may be localized by the model.

export interface AnalysisShot {
  index: number;
  start: number;
  end: number;
  role: string;
  prompt: string;
}

/** A Vietnamese reading of an analysis for display; the English fields above stay what Create receives. */
export interface AnalysisVi {
  format: string;
  hook: string;
  summary: string;
  shots: string[]; // one per shot, same order as Analysis.shots
}

export interface Analysis {
  durationS: number;
  shotCount: number;
  format: string;
  hook: string;
  summary: string;
  shots: AnalysisShot[];
  vi?: AnalysisVi;
}

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function parseBreakdown(raw: unknown): Analysis {
  const d = obj(raw);
  const whole = obj(d.whole_video_vlm);
  const summary = obj(d.summary);
  const shots = arr(d.shots).map((s, i): AnalysisShot => {
    const sh = obj(s);
    const narrative = obj(sh.narrative);
    return { index: num(sh.index, i + 1), start: num(sh.start), end: num(sh.end), role: str(narrative.role), prompt: str(narrative.point) };
  });
  return {
    durationS: num(summary.duration),
    shotCount: shots.length || num(summary.shots),
    format: str(whole.format),
    hook: str(whole.hook),
    summary: str(whole.summary),
    shots,
  };
}
