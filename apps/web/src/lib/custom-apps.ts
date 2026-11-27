// The pure half of the custom apps (an Admin's one-tap app made from a live clip, docs/WORKSPACES.md §2): what a source job may become, what an app's fields must meet,
// how a run's photos are put in order, and the Apps card of a row. Client-safe; lib/custom-apps-db.ts holds the queries.
import type { CustomAppInput } from '@cvs/db';
import { thumbUrl } from './api';
import { type AppConfig, CATEGORIES } from './apps';

export const MAX_APP_NAME = 60;
export const MAX_APP_DESCRIPTION = 200;
export const MAX_SLOT_LABEL = 40;
export const MAX_SLOT_HINT = 100;
/** The code of a refusal the run route makes itself (the page shows its text); DELETE /api/jobs/[id] answers `APP_SOURCE_CODE` for a clip that is an app's source. */
export const CUSTOM_APP_CODE = 'custom_app';
export const APP_SOURCE_CODE = 'app_source';

/** What a job's own settings let an app keep: a video's sound, an image's resolution, quality and thinking. Everything else (the member's own text, the batch id) stays out. */
const KEPT_PARAMS: Record<string, string[]> = { video: ['audio'], image: ['resolution', 'quality', 'thinking'] };

/** A source job as the server reads it from its row. */
export interface SourceJob {
  feature: string;
  presetId: string | null;
  prompt: string;
  enhancedPrompt: string | null;
  ratio: string;
  durationSec: number;
  params: Record<string, string>;
  inputCount: number;
}

/** What an app starts from: the job's feature, prompt, ratio, duration and kept params, and a default slot for each input. */
export interface AppDraft {
  feature: 'video' | 'image';
  prompt: string;
  aspect: string;
  durationS: number;
  params: Record<string, string>;
  inputs: { slot: { label: string; hint: string } }[];
}

/** An app made from `job`, or the Vietnamese reason it cannot be made. Presets, styles and brand kits stay out: their text is the company's, and a run's prompt is visible to the member. */
export function draftFromJob(job: SourceJob): AppDraft | string {
  if (job.feature !== 'video' && job.feature !== 'image') return 'Chỉ biến được kết quả video hoặc ảnh thành ứng dụng.';
  if (job.inputCount === 0) return 'Lượt này không có ảnh đầu vào nên chưa biến thành ứng dụng được.';
  if (job.presetId !== null) return 'Lượt này dùng mẫu chuyển động hoặc phong cách có sẵn nên chưa biến thành ứng dụng được.';
  if (job.params.brand === 'on') return 'Lượt này dùng bộ nhận diện cửa hàng nên chưa biến thành ứng dụng được.';
  if (job.params.endAssetId !== undefined || job.params.audioAssetIds !== undefined || job.params.videoAssetId !== undefined) {
    return 'Lượt này dùng khung hình cuối, âm thanh hoặc video tham chiếu nên chưa biến thành ứng dụng được.';
  }
  return {
    feature: job.feature,
    prompt: (job.enhancedPrompt ?? job.prompt).trim(),
    aspect: job.ratio,
    durationS: job.feature === 'video' ? job.durationSec : 0,
    params: Object.fromEntries(KEPT_PARAMS[job.feature]!.flatMap((k) => (job.params[k] === undefined ? [] : [[k, job.params[k]]]))),
    inputs: Array.from({ length: job.inputCount }, (_, i) => ({ slot: { label: `Ảnh ${i + 1}`, hint: '' } })),
  };
}

/** The Library button's client-side test on a job as GET /api/jobs/[id] returns it; the server stays the judge. */
export const canOfferApp = (feature: string, job: { inputCount: number; presetId: string | null; brand: boolean }): boolean =>
  (feature === 'video' || feature === 'image') && job.inputCount > 0 && job.presetId === null && !job.brand;

/** An input as a body sends it: a slot the member fills (its label and hint), or the source job's own photo kept (`fixed`; stored as that photo's id). */
export type AppInputBody = { slot: { label: string; hint: string } } | { fixed: unknown };
export interface AppFields {
  name: string;
  description: string;
  category: string;
  prompt: string;
  inputs: AppInputBody[];
}

/** The fields as they are stored: the text trimmed. */
export const cleanApp = (a: AppFields): AppFields => ({
  ...a,
  name: a.name.trim(),
  description: a.description.trim(),
  prompt: a.prompt.trim(),
  inputs: a.inputs.map((i) => ('slot' in i ? { slot: { label: i.slot.label.trim(), hint: i.slot.hint.trim() } } : i)),
});

const length = (s: string) => [...s].length; // characters, as the table's checks count them
const oneLine = (s: string) => !/\p{Cc}/u.test(s);

/** The first reason (Vietnamese) the fields cannot be saved for a source job with `sourceInputCount` inputs and a model that takes `maxPromptChars`; null when they can. The text is trimmed first. */
export function appInputProblem(fields: AppFields, sourceInputCount: number, maxPromptChars: number): string | null {
  const a = cleanApp(fields);
  if (a.name === '' || length(a.name) > MAX_APP_NAME || !oneLine(a.name)) return `Hãy đặt tên ứng dụng, một dòng, tối đa ${MAX_APP_NAME} ký tự.`;
  if (length(a.description) > MAX_APP_DESCRIPTION) return `Mô tả ngắn tối đa ${MAX_APP_DESCRIPTION} ký tự.`;
  if (!CATEGORIES.some((c) => c.id !== 'all' && c.id === a.category)) return 'Hãy chọn danh mục.';
  if (a.prompt === '') return 'Hãy nhập mô tả gửi cho mô hình.';
  if (/\u0000/.test(a.description + a.prompt)) return 'Mô tả có ký tự không hợp lệ.'; // Postgres text refuses NUL
  if (a.prompt.length > maxPromptChars) return `Mô tả gửi cho mô hình tối đa ${maxPromptChars} ký tự.`; // UTF-16 units, as /api/jobs counts them
  if (a.inputs.length !== sourceInputCount) return `Ứng dụng cần đúng ${sourceInputCount} ảnh đầu vào, như lượt gốc.`;
  const slots = a.inputs.flatMap((i) => ('slot' in i ? [i.slot] : []));
  if (slots.length === 0) return 'Cần ít nhất một ô để người dùng tải ảnh lên.';
  if (slots.some((s) => s.label === '' || length(s.label) > MAX_SLOT_LABEL || !oneLine(s.label))) return `Tên ô phải có 1 đến ${MAX_SLOT_LABEL} ký tự, một dòng.`;
  if (new Set(slots.map((s) => s.label.toLowerCase())).size < slots.length) return 'Hai ô không được trùng tên.';
  if (slots.some((s) => length(s.hint) > MAX_SLOT_HINT || !oneLine(s.hint))) return `Gợi ý trong ô tối đa ${MAX_SLOT_HINT} ký tự, một dòng.`;
  return null;
}

/** The photos of a run in the source's order: each fixed input as stored, each slot the next of `slotIds`. */
export function composeAssetIds(inputs: CustomAppInput[], slotIds: string[]): string[] {
  let next = 0;
  return inputs.map((i) => ('fixed' in i ? i.fixed : slotIds[next++]!));
}

export const hasDuplicate = (ids: string[]): boolean => new Set(ids).size !== ids.length;

/** What the run page needs of an app beyond its card. It carries no prompt. */
export interface CustomAppSettings {
  /** The ids of the app's pair of duplicate models (lib/model-twins.ts): the page prices the row of the model list among them. */
  modelIds: string[];
  ratio: string;
  durationSec: number;
  inputCount: number;
  audio?: string;
  resolution?: string;
  thinking?: string;
  /** The source result, as a card shows it. */
  art: { video: string | null; poster: string | null };
}

/** The Apps card and run page of an app: an AppConfig plus its settings. */
export type CustomAppConfig = AppConfig & { custom: CustomAppSettings };

export interface CustomAppRow {
  id: string;
  feature: string;
  name: string;
  description: string;
  category: string;
  aspect: string;
  durationS: number;
  params: Record<string, string>;
  inputs: CustomAppInput[];
  publishedAt: Date | null;
  outputAssetId: string;
  posterAssetId: string | null;
}

const ICT_MS = 7 * 3_600_000;

export function toAppConfig(row: CustomAppRow, pairIds: string[]): CustomAppConfig {
  const video = row.feature === 'video';
  return {
    slug: row.id,
    feature: row.feature,
    name: row.name,
    description: row.description,
    category: row.category as AppConfig['category'],
    slots: row.inputs.flatMap((i) => ('slot' in i ? [{ label: i.slot.label, inputLabel: i.slot.label, empty: i.slot.hint || 'Thêm 1 ảnh' }] : [])),
    added: row.publishedAt ? new Date(row.publishedAt.getTime() + ICT_MS).toISOString().slice(0, 10) : undefined,
    custom: {
      modelIds: pairIds,
      ratio: row.aspect,
      durationSec: row.durationS,
      inputCount: row.inputs.length,
      audio: row.params.audio,
      resolution: row.params.resolution,
      thinking: row.params.thinking,
      art: video ? { video: `/api/assets/${row.outputAssetId}/content`, poster: row.posterAssetId ? thumbUrl(row.posterAssetId) : null } : { video: null, poster: thumbUrl(row.outputAssetId) },
    },
  };
}
