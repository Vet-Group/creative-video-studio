// What POST /api/admin/apps and PATCH /api/admin/apps/[id] share: the `inputs` of a body, and how they are stored against the source job.
import type { CustomAppInput } from '@cvs/db';
import type { AppInputBody } from '@/lib/custom-apps';

const hasOnly = (o: object, keys: string[]) => Object.keys(o).length === keys.length && keys.every((k) => k in o);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The `inputs` of a body: `{ slot: { label, hint } }` or `{ fixed: true }` for each input of the source job, in its order. Nothing else is read, so an asset id sent by
 * the client is refused (undefined) rather than stored: a fixed photo is only ever the source job's own (fixedInputs).
 */
export function parseInputs(v: unknown): AppInputBody[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const parsed: AppInputBody[] = [];
  for (const i of v) {
    if (!isRecord(i)) return undefined;
    if (hasOnly(i, ['fixed']) && i.fixed === true) parsed.push({ fixed: true });
    else if (hasOnly(i, ['slot']) && isRecord(i.slot) && hasOnly(i.slot, ['label', 'hint']) && typeof i.slot.label === 'string' && typeof i.slot.hint === 'string') {
      parsed.push({ slot: { label: i.slot.label, hint: i.slot.hint } });
    } else return undefined;
  }
  return parsed;
}

/** The inputs as the table stores them: each `fixed` is the id of the source job's input at its place. */
export const fixedInputs = (inputs: AppInputBody[], sourceInputIds: string[]): CustomAppInput[] =>
  inputs.map((i, n) => ('slot' in i ? { slot: i.slot } : { fixed: sourceInputIds[n]! }));

/** The refusal when an input kept fixed is a photo of the clip that has been deleted since (a Run would then fail for every member). */
export const LOST_FIXED = 'Ảnh cố định của lượt gốc đã bị xoá: hãy để người dùng tải lên ô đó.';

/** Whether an input kept fixed points at a photo of the clip that is no longer live (`live`: the ids of the clip's live input photos). */
export const lostFixed = (inputs: AppInputBody[], sourceInputIds: string[], live: Set<string>) => inputs.some((i, n) => 'fixed' in i && !live.has(sourceInputIds[n]!));

/** Whether `body` has no key outside `keys`. */
export const onlyKeys = (body: Record<string, unknown>, keys: string[]) => Object.keys(body).every((k) => keys.includes(k));
