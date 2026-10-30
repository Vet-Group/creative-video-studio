// Saved forms (user_templates): the inputs of one page in the shape the reuse link reads from a job, so a template refills a form the same way.
import { PROMPT_CEILING } from '@cvs/core/models';

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
  clips?: string[];
  prompt?: string;
  brief?: string;
  script?: string;
  hook?: string;
  location?: string;
  format?: string;
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
const SHORT = ['ratio', 'resolution', 'modelId', 'presetId', 'storeId', 'endFrame'] as const;
const FIELDS = new Set<string>(['images', 'clips', ...TEXT, ...SHORT, 'hook', 'location', 'format', 'audio', 'enhance', 'garments', 'durationSec']);
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
  if (d.format !== undefined && d.format !== 'advanced') return 'data.format must be advanced';
  if (d.audio !== undefined && d.audio !== 'on' && d.audio !== 'off') return 'data.audio must be on or off';
  if (d.enhance !== undefined && typeof d.enhance !== 'boolean') return 'data.enhance must be true or false';
  if (d.garments !== undefined && !whole(d.garments, 1, 6)) return 'data.garments must be 1 to 6';
  if (d.durationSec !== undefined && !whole(d.durationSec, 1, 60)) return 'data.durationSec must be 1 to 60';
  return { ...(d as TemplateData), images: images as string[] };
}
