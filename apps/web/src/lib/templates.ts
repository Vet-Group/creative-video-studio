// Saved forms (user_templates): the inputs of one page in the shape the reuse link reads from a job, so a template refills a form the same way.
import { PROMPT_CEILING } from '@cvs/core/models';
import { END_TEXT_POSITIONS, isParamFormat, MAX_END_TEXT, MAX_ENDING, MAX_HIGHLIGHT, MAX_HIGHLIGHTS, MAX_HOOK, PARAM_FORMATS, UNBOXING_ROLES } from './marketing';

/** The most templates one member keeps. */
export const MAX_TEMPLATES = 50;
export const MAX_TEMPLATE_NAME = 60;
const MAX_TEXT = PROMPT_CEILING; // the longest prompt any model takes
const MAX_IMAGES = 7;
const MAX_CLIPS = 10; // the most reference audio clips a model takes (Seedance 2.5)

/** A template's stored inputs: asset ids for the images, Create video's end frame and reference audio, and the fields of GET /api/jobs/:id the pages refill from. */
export type TemplateData = {
  images: string[];
  endFrame?: string;
  /** Marketing Studio Advanced's reference video (an asset id). */
  videoRef?: string;
  clips?: string[];
  prompt?: string;
  brief?: string;
  script?: string;
  /** The prompt's sections (Create and Marketing Studio): the member's own hook and the last shot, and the way the prompt was written. */
  hookText?: string;
  ending?: string;
  promptMode?: 'sections' | 'free';
  /** Marketing Studio's end text burned over the clip, with its position. */
  endText?: string;
  endTextPos?: string;
  hook?: string;
  location?: string;
  format?: string;
  /** Unboxing's photo roles in the order of `images`, and Review's highlight lines. */
  roles?: string;
  highlights?: string[];
  audio?: string;
  enhance?: boolean;
  garments?: number;
  durationSec?: number;
  ratio?: string;
  resolution?: string;
  modelId?: string;
  presetId?: string;
  storeId?: string;
};

const TEXT = ['prompt', 'brief', 'script'] as const;
const SHORT = ['ratio', 'resolution', 'modelId', 'presetId', 'storeId', 'endFrame', 'videoRef'] as const;
const FIELDS = new Set<string>(['images', 'clips', ...TEXT, ...SHORT, 'hookText', 'ending', 'promptMode', 'endText', 'endTextPos', 'hook', 'location', 'format', 'roles', 'highlights', 'audio', 'enhance', 'garments', 'durationSec']);
const whole = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** The checked data of a template, or the reason it is refused. Unknown keys, wrong types and over-long text are refused; the route checks the hook and the location. */
export function templateData(raw: unknown): TemplateData | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'data must be an object';
  const d = raw as Record<string, unknown>;
  const unknown = Object.keys(d).find((k) => !FIELDS.has(k));
  if (unknown) return `data.${unknown} is not a template field`;
  const images = d.images ?? [];
  if (!Array.isArray(images) || images.length > MAX_IMAGES || !images.every((i) => typeof i === 'string') || new Set(images).size !== images.length) {
    return `data.images must list up to ${MAX_IMAGES} different asset ids`;
  }
  const clips = d.clips;
  if (clips !== undefined && (!Array.isArray(clips) || clips.length > MAX_CLIPS || !clips.every((i) => typeof i === 'string') || new Set(clips).size !== clips.length)) {
    return `data.clips must list up to ${MAX_CLIPS} different asset ids`;
  }
  for (const k of TEXT) if (d[k] !== undefined && (typeof d[k] !== 'string' || (d[k] as string).length > MAX_TEXT)) return `data.${k} must be text of at most ${MAX_TEXT} characters`;
  for (const k of SHORT) if (d[k] !== undefined && (typeof d[k] !== 'string' || (d[k] as string).length > 100)) return `data.${k} must be short text`;
  // The route resolves the hook and the location with findChoice (lib/choices.ts): a built-in or a member's own id.
  if (d.hook !== undefined && (typeof d.hook !== 'string' || d.hook.length > 100)) return 'data.hook is not a hook';
  if (d.location !== undefined && (typeof d.location !== 'string' || d.location.length > 100)) return 'data.location is not a location';
  for (const [k, max] of [['hookText', MAX_HOOK], ['ending', MAX_ENDING], ['endText', MAX_END_TEXT]] as const) if (d[k] !== undefined && (typeof d[k] !== 'string' || (d[k] as string).length > max)) return `data.${k} must be text of at most ${max} characters`;
  if (d.endTextPos !== undefined && !(END_TEXT_POSITIONS as readonly unknown[]).includes(d.endTextPos)) return `data.endTextPos must be one of ${END_TEXT_POSITIONS.join(', ')}`;
  if (d.format !== undefined && !isParamFormat(d.format)) return `data.format must be one of ${PARAM_FORMATS.join(', ')}`;
  if (d.roles !== undefined) {
    if (!(UNBOXING_ROLES as readonly unknown[]).includes(d.roles)) return `data.roles must be one of ${UNBOXING_ROLES.join(' | ')}`;
    if (d.format !== 'unboxing' || (d.roles as string).split(',').length !== images.length) return 'data.roles goes with the unboxing format and names each of its images';
  }
  if (d.highlights !== undefined) {
    const h = d.highlights;
    if (!Array.isArray(h) || h.length < 1 || h.length > MAX_HIGHLIGHTS || !h.every((l) => typeof l === 'string' && l.trim() !== '' && l.length <= MAX_HIGHLIGHT && !/\p{Cc}/u.test(l))) {
      return `data.highlights must list 1 to ${MAX_HIGHLIGHTS} non-blank lines of at most ${MAX_HIGHLIGHT} characters, one line each`;
    }
    if (d.format !== 'review') return 'data.highlights goes with the review format';
  }
  if (d.promptMode !== undefined && d.promptMode !== 'sections' && d.promptMode !== 'free') return 'data.promptMode must be sections or free';
  if (d.audio !== undefined && d.audio !== 'on' && d.audio !== 'off') return 'data.audio must be on or off';
  if (d.enhance !== undefined && typeof d.enhance !== 'boolean') return 'data.enhance must be true or false';
  if (d.garments !== undefined && !whole(d.garments, 1, 6)) return 'data.garments must be 1 to 6';
  if (d.durationSec !== undefined && !whole(d.durationSec, 1, 60)) return 'data.durationSec must be 1 to 60';
  return { ...(d as TemplateData), images: images as string[] };
}
