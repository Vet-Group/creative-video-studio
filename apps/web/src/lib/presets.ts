// Preset writes shared by the Admin page, the template editors on Create and an approved proposal: the checks, the change and its audit row.
import { audit } from '@cvs/core/audit';
import { type Queryable, withTransaction } from '@cvs/core/ledger';
import { PROMPT_CEILING } from '@cvs/core/models';
import { PRESET_FEATURES } from '@cvs/db';
import { bad, nonEmpty, readBody } from './admin';
import { pool } from './auth';
import { guard } from './session';

export interface Preset {
  id: string;
  label: string;
  prompt: string;
  sortOrder: number;
  enabled: boolean;
}
export type PresetFields = Partial<Omit<Preset, 'id'>>;
export type PresetFeature = (typeof PRESET_FEATURES)[number];

/** The page a preset belongs to, from a query or a body: `video` (Create) when left out, `image` (Image Generation), or null when it is neither. */
export function presetFeature(value: unknown): PresetFeature | null {
  if (value === undefined || value === null) return 'video';
  return (PRESET_FEATURES as readonly unknown[]).includes(value) ? (value as PresetFeature) : null;
}

export const MAX_PRESET_LABEL = 100;

/** The preset fields a body gives (`label`, `prompt`, `sortOrder`, `enabled`), or the reason they are refused. */
export function presetFields(body: Record<string, unknown>): PresetFields | string {
  const { label, prompt, sortOrder, enabled } = body;
  if ((label !== undefined && !nonEmpty(label)) || (prompt !== undefined && !nonEmpty(prompt)) || (enabled !== undefined && typeof enabled !== 'boolean')) {
    return 'label and prompt must be non-empty, enabled true or false';
  }
  if ((typeof label === 'string' && label.length > MAX_PRESET_LABEL) || (typeof prompt === 'string' && prompt.length > PROMPT_CEILING)) {
    return `label has at most ${MAX_PRESET_LABEL} characters, prompt ${PROMPT_CEILING}`;
  }
  if (sortOrder !== undefined && !(Number.isInteger(sortOrder) && Math.abs(sortOrder as number) <= 1_000_000)) return 'sortOrder must be a whole number';
  return Object.fromEntries(Object.entries({ label, prompt, sortOrder, enabled }).filter(([, v]) => v !== undefined));
}

/** A new preset's id from its label: ASCII lower-case words joined by dashes (Vietnamese marks dropped), so `preset-<id>.mp4` is a valid sample name. */
export function presetSlug(label: string): string {
  const words = label.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return words.slice(0, 40).replace(/^-+|-+$/g, '') || 'preset';
}

/** Changes what `fields` gives of one preset and audits the old and new values of what changed as preset.update; null when there is no such preset. */
export async function updatePreset(tx: Queryable, actorId: string, id: string, fields: PresetFields): Promise<Preset | null> {
  const old = (await tx.query('select label, prompt, sort_order as "sortOrder", enabled from presets where id = $1 for update', [id])).rows[0];
  if (!old) return null;
  const next = { ...old, ...fields };
  const changed = Object.keys(old).filter((k) => next[k] !== old[k]);
  if (changed.length > 0) {
    await tx.query('update presets set label = $2, prompt = $3, sort_order = $4, enabled = $5, updated_at = now() where id = $1', [id, next.label, next.prompt, next.sortOrder, next.enabled]);
    await audit(tx, {
      actorId, action: 'preset.update', target: `preset:${id}`,
      oldValue: Object.fromEntries(changed.map((k) => [k, old[k]])), newValue: Object.fromEntries(changed.map((k) => [k, next[k]])),
    });
  }
  return { id, ...next };
}

/**
 * Adds a preset to `feature`'s picker, audited as preset.create. Its id is the label's slug, with -2, -3... when taken; `general` is kept for the
 * free prompt's sample (preset-general). It is enabled and last in its picker unless `fields` says otherwise.
 */
export async function createPreset(tx: Queryable, actorId: string, fields: PresetFields & Pick<Preset, 'label' | 'prompt'>, feature: PresetFeature = 'video'): Promise<Preset> {
  await tx.query(`select pg_advisory_xact_lock(hashtext('preset.create'))`); // two adds of one label must not pick the same id
  const base = presetSlug(fields.label);
  let id = base;
  for (let n = 2; id === 'general' || (await tx.query('select 1 from presets where id = $1', [id])).rowCount; n++) id = `${base}-${n}`;
  const sortOrder = fields.sortOrder ?? (await tx.query('select coalesce(max(sort_order), 0) + 1 as n from presets where feature = $1', [feature])).rows[0].n;
  const preset = { id, label: fields.label, prompt: fields.prompt, sortOrder, enabled: fields.enabled ?? true };
  await tx.query('insert into presets (id, label, prompt, sort_order, enabled, feature) values ($1, $2, $3, $4, $5, $6)', [id, preset.label, preset.prompt, sortOrder, preset.enabled, feature]);
  await audit(tx, { actorId, action: 'preset.create', target: `preset:${id}`, newValue: { label: preset.label, prompt: preset.prompt, sortOrder, enabled: preset.enabled, feature } });
  return preset;
}

/** PATCH of one preset by a template editor (/api/presets/[id]). */
export async function patchPreset(request: Request, id: string): Promise<Response> {
  const g = await guard(request, 'editor');
  if (g.error) return g.error;
  const fields = presetFields((await readBody(request)) ?? {});
  if (typeof fields === 'string') return bad(fields);
  if (Object.keys(fields).length === 0) return bad('give at least one of label, prompt, sortOrder, enabled');
  return withTransaction(pool, async (tx): Promise<Response> => {
    const preset = await updatePreset(tx, g.session.user.id, id, fields);
    return preset ? Response.json(preset) : bad('not found', 404);
  });
}
