// The English prompt each scene of an analysis gives Create. rea-video's per-shot `point` is a one-sentence story beat about the source's own
// product (cut to 200 characters), not a generation prompt; so one LLM call per analysis rewrites every scene into a detailed, product-neutral
// prompt from what rea-video measured and saw (owner decision, 2026-11-16), on the same chat as the Vietnamese reading (translate.ts).
// Best-effort: the caller keeps the points when the answer is missing or malformed.
import { type Analysis, sameScene } from './breakdown';
import { type AnalysisLlmKeys, CJK, type Chat, analysisChat, unfence } from './translate';

export const ANALYSIS_PROMPTS_SYSTEM =
  'You write prompts for an AI video model from a shot-by-shot analysis of a short product video, so a seller can film the same scenes with their own product. ' +
  'You get a JSON object {"count":N,"video":{...},"scenes":[...]} with N scenes. Each scene has its number "n", its length in "seconds", its story "role" and "beat", and one entry in ' +
  '"cuts" per camera cut with what the analysis saw: the action, a description, the shot size, the subject\'s position, the camera and the look. ' +
  'Some values are in Chinese: read them, but write only English. ' +
  'For each scene write exactly one English prompt of 60 to 120 words as a single plain paragraph, covering all of its cuts in order (a scene with three cuts still gets one prompt), in this order: the shot size and camera angle; ' +
  'the camera movement; where the subject sits in the frame; the action beats in order, ending with the end state; then the lighting, the setting and the style. ' +
  'Describe the product only generically, as "the product" or by its type, such as "the shirt" or "the hoodie". Never give its colours, prints, patterns, ' +
  'text, logos or brand: the seller\'s own product photo decides how it looks. ' +
  'Describe people generically, such as "a woman" or "the model", without identifying traits such as tattoos, scars, piercings or a distinctive hairstyle. ' +
  'Use positive phrasing only: write what is seen and what happens, never what is absent or to be avoided. Leave out on-screen text, captions and speech. ' +
  'Reply with only a JSON object {"prompts":[...]} holding exactly N prompts: one per scene, never one per cut, in the order of "scenes".';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** What rea-video saw of one camera cut, for the writer; empty fields are left out. */
function cut(raw: unknown, start: number, end: number): Raw {
  const sh = obj(raw);
  const vlm = obj(sh.vlm);
  const framing = obj(obj(obj(sh.aspects).framing).measured);
  const camera = obj(obj(obj(sh.aspects).camera).measured);
  const look = obj(vlm.aspects);
  return {
    seconds: round1(end - start),
    action: str(obj(vlm.replication).video_prompt_en) || undefined,
    description: str(vlm.description) || undefined,
    shot_size: str(framing.shot_size) || str(vlm.shot_size) || undefined,
    position: str(framing.position) || undefined,
    camera: [str(camera.support), str(camera.motion), str(vlm.camera_move)].filter(Boolean).join(', ') || undefined,
    look: Object.keys(look).length ? look : undefined,
    style: str(vlm.style) || undefined,
  };
}

/**
 * The pure writer over an injected chat: one call for the whole analysis, one prompt per scene (adjacent shots with the same role and point, as
 * mergeShots shows them), given back to every stored shot of its scene. `raw` is the breakdown.json the analysis was parsed from, shot for shot.
 * Throws on an answer that is not JSON, has the wrong count, an empty prompt or Chinese script.
 */
export async function writeScenePrompts(a: Analysis, raw: unknown, chat: Chat): Promise<{ prompts: string[]; costUsd: number | null }> {
  if (a.shots.length === 0) return { prompts: [], costUsd: null };
  const rawShots = Array.isArray(obj(raw).shots) ? (obj(raw).shots as unknown[]) : [];
  const scenes: number[][] = []; // positions of the stored shots in each scene
  a.shots.forEach((s, i) => (i > 0 && sameScene(a.shots[i - 1]!, s) ? scenes.at(-1)!.push(i) : scenes.push([i])));
  const whole = obj(obj(raw).whole_video_vlm);
  const unit = obj((obj(obj(raw).production_plan).units as unknown[] | undefined)?.[0]);
  const input = JSON.stringify({
    count: scenes.length,
    video: { summary: a.summary || undefined, format: str(whole.format) || undefined, look: str(unit.prompt).split('\n')[0] || undefined },
    scenes: scenes.map((idx, k) => {
      const head = a.shots[idx[0]!]!;
      return {
        n: k + 1,
        seconds: round1(a.shots[idx.at(-1)!]!.end - head.start),
        role: head.role || undefined,
        beat: head.point ?? head.prompt,
        cuts: idx.map((i) => cut(rawShots[i], a.shots[i]!.start, a.shots[i]!.end)),
      };
    }),
  });
  const { text, costUsd } = await chat(ANALYSIS_PROMPTS_SYSTEM, input, 200 + 400 * scenes.length);
  let v: { prompts?: unknown } | null;
  try {
    v = JSON.parse(unfence(text));
  } catch {
    throw new Error('analyze prompts: the answer is not JSON');
  }
  // One plain paragraph each, as Create's prompt box shows it.
  const prompts = Array.isArray(v?.prompts) ? v.prompts.map((p) => (typeof p === 'string' ? p.replace(/\s+/g, ' ').trim() : '')) : [];
  if (prompts.length !== scenes.length) throw new Error('analyze prompts: scene count mismatch');
  if (prompts.some((p) => p === '')) throw new Error('analyze prompts: an empty prompt');
  if (CJK.test(prompts.join('\n'))) throw new Error('analyze prompts: the answer is not English');
  const byShot: string[] = [];
  scenes.forEach((idx, k) => idx.forEach((i) => (byShot[i] = prompts[k]!)));
  return { prompts: byShot, costUsd };
}

/** The worker's default writer on analysisChat (gpt-6-luna, else fal); undefined when no key is set. */
export function createAnalysisPromptWriter(opts: AnalysisLlmKeys): ((a: Analysis, raw: unknown) => Promise<{ prompts: string[]; costUsd: number | null }>) | undefined {
  const c = analysisChat(opts, 'analyze prompts');
  return c && ((a, raw) => writeScenePrompts(a, raw, c.chat));
}
