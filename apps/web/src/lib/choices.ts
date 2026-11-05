// The choices library (server only): a hook, location or ending by id, a built-in one or a member's own (user_choices) that the caller may use, and the
// fields POST and PATCH /api/choices take.
import type { ChoiceKind } from '@cvs/db';
import { pool, type Session } from './auth';
import { BUILT_IN_CHOICES, MAX_CHOICE_DESC, MAX_CHOICE_NAME, MAX_CHOICE_NICHE, MAX_CHOICE_PHRASE, type MarketingChoice } from './marketing';
import { isEditor } from './session';

export type FoundChoice = MarketingChoice & { isCompany: boolean; builtIn: boolean };

/** The choice `id` of `kind` that `userId` may use: a built-in, their own, a company one or one of a store that is not hidden; undefined for any other id. */
export async function findChoice(userId: string, kind: ChoiceKind, id: string): Promise<FoundChoice | undefined> {
  const builtIn = BUILT_IN_CHOICES[kind].find((c) => c.id === id);
  if (builtIn) return { ...builtIn, isCompany: false, builtIn: true };
  const r = (
    await pool.query(
      `select c.id, c.name, c.description, c.phrase, c.is_company from user_choices c left join stores s on s.id = c.store_id
        where c.id = $1 and c.kind = $2 and (c.user_id = $3 or c.is_company or not s.hidden)`,
      [id, kind, userId],
    )
  ).rows[0];
  return r && { id: r.id, name: r.name, desc: r.description ?? '', phrase: r.phrase, isCompany: r.is_company, builtIn: false };
}

/** Where a choice shows in the pickers: shared with a store, with the company, the member's own private one, or built in. */
export type ChoiceGroup = 'store' | 'company' | 'mine' | 'builtin';
export type ListedChoice = MarketingChoice & {
  kind: ChoiceKind; group: ChoiceGroup; isCompany: boolean; mine: boolean; storeId: string | null; storeName: string | null; niche: string | null;
  /** The photo, while its upload is not deleted. */
  imageAssetId: string | null;
};

/** The select list and joins of a listed choice (`c`, its store `s`); $1 is the caller. */
export const CHOICE_SQL = `select c.id, c.kind, c.name, c.description, c.phrase, c.is_company, c.store_id, s.name as store_name, c.niche, c.user_id = $1 as mine,
    (select a.id from assets a where a.id = c.image_asset_id and a.deleted_at is null) as image_asset_id
  from user_choices c left join stores s on s.id = c.store_id`;

export const listedChoice = (r: Record<string, unknown>): ListedChoice => ({
  kind: r.kind as ChoiceKind, id: r.id as string, name: r.name as string, desc: (r.description as string | null) ?? '', phrase: r.phrase as string,
  group: r.store_id ? 'store' : r.is_company ? 'company' : 'mine', isCompany: r.is_company as boolean, mine: r.mine as boolean,
  storeId: (r.store_id as string | null) ?? null, storeName: (r.store_name as string | null) ?? null, niche: (r.niche as string | null) ?? null, imageAssetId: (r.image_asset_id as string | null) ?? null,
});

const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u; // newlines and other control characters would break the one-line prompt
const text = (v: unknown, max: number, min = 1) => (typeof v === 'string' && !CONTROL.test(v) && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);

/** The stored fields of a choice that POST and PATCH set. */
export type ChoiceFields = { name: string; phrase: string; desc: string; isCompany: boolean; storeId: string | null; niche: string | null; imageAssetId: string | null };

/**
 * Reads and checks the fields of a POST, or with `current` a PATCH's changes over the stored ones: `name` (1 to 40 characters), `phrase` (the English
 * words the prompt takes, 1 to 300), `desc` (up to 100), `niche` (1 to 30, null or empty for none), none holding a newline or another control character;
 * the share level, `isCompany` (a template editor only) or `storeId` (a store that is not hidden), giving one turns the other off; `imageAssetId`, one of
 * the caller's own uploaded photos, or null. A store or photo kept as it was is not checked again. An error has its status.
 */
export async function choiceFields(b: Record<string, unknown>, user: Session['user'], current?: ChoiceFields): Promise<ChoiceFields | { error: string; status: number }> {
  const bad = (error: string, status = 400) => ({ error, status });
  const name = b.name === undefined && current ? current.name : text(b.name, MAX_CHOICE_NAME);
  if (name === null) return bad(`name must have 1 to ${MAX_CHOICE_NAME} characters on one line`);
  const phrase = b.phrase === undefined && current ? current.phrase : text(b.phrase, MAX_CHOICE_PHRASE);
  if (phrase === null) return bad(`phrase must have 1 to ${MAX_CHOICE_PHRASE} characters on one line`);
  const desc = b.desc === undefined ? (current?.desc ?? '') : text(b.desc, MAX_CHOICE_DESC, 0);
  if (desc === null) return bad(`desc may have at most ${MAX_CHOICE_DESC} characters on one line`);
  const niche = b.niche === undefined ? (current?.niche ?? null) : b.niche === null || b.niche === '' ? null : text(b.niche, MAX_CHOICE_NICHE);
  if (niche === null && b.niche !== undefined && b.niche !== null && b.niche !== '') return bad(`niche may have 1 to ${MAX_CHOICE_NICHE} characters on one line`);
  if (b.isCompany !== undefined && typeof b.isCompany !== 'boolean') return bad('isCompany must be true or false');
  if (b.storeId !== undefined && b.storeId !== null && typeof b.storeId !== 'string') return bad('storeId is a store id or null');
  const level = b.isCompany !== undefined || b.storeId !== undefined;
  const isCompany = level ? b.isCompany === true : (current?.isCompany ?? false);
  const storeId = level ? ((b.storeId as string | null | undefined) ?? null) : (current?.storeId ?? null);
  if (isCompany && storeId !== null) return bad('storeId is a store id, given without isCompany');
  if (isCompany && !current?.isCompany && !isEditor(user)) return bad('only an Admin or a template editor shares with the company', 403);
  if (storeId !== null && storeId !== current?.storeId && !(await pool.query('select 1 from stores where id = $1 and not hidden', [storeId])).rowCount) return bad('the store does not exist or is hidden');
  if (b.imageAssetId !== undefined && b.imageAssetId !== null && typeof b.imageAssetId !== 'string') return bad('imageAssetId must be one of your own uploaded photos');
  const imageAssetId = b.imageAssetId === undefined ? (current?.imageAssetId ?? null) : (b.imageAssetId as string | null);
  if (imageAssetId !== null && imageAssetId !== current?.imageAssetId) {
    const own = await pool.query(`select 1 from assets where id = $1 and owner_id = $2 and kind = 'input' and deleted_at is null and mime like 'image/%'`, [imageAssetId, user.id]);
    if (!own.rowCount) return bad('imageAssetId must be one of your own uploaded photos');
  }
  return { name, phrase, desc, isCompany, storeId, niche, imageAssetId };
}
