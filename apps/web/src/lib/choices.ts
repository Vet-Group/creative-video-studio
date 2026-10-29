// A Marketing Studio hook or location by id (server only): a built-in one, or a member's own (user_choices) that the caller may use.
import type { ChoiceKind } from '@cvs/db';
import { pool } from './auth';
import { HOOKS, LOCATIONS, type MarketingChoice } from './marketing';

export type FoundChoice = MarketingChoice & { isCompany: boolean; builtIn: boolean };

/** The choice `id` of `kind` that `userId` may use: a built-in, their own, or a company one; undefined for any other id. */
export async function findChoice(userId: string, kind: ChoiceKind, id: string): Promise<FoundChoice | undefined> {
  const builtIn = (kind === 'hook' ? HOOKS : LOCATIONS).find((c) => c.id === id);
  if (builtIn) return { ...builtIn, isCompany: false, builtIn: true };
  const r = (await pool.query('select id, name, description, phrase, is_company from user_choices where id = $1 and kind = $2 and (user_id = $3 or is_company)', [id, kind, userId])).rows[0];
  return r && { id: r.id, name: r.name, desc: r.description ?? '', phrase: r.phrase, isCompany: r.is_company, builtIn: false };
}
