// The changelog members read on /changelog (the "What's new" page), in plain Vietnamese: what a member can now do and why it matters, not how it was built.
// Every pull request with a change a member or an Admin can notice adds one entry file to changelog-entries/, named after its `at`
// (2026-11-16T16:30:00+07:00 is 20261116-163000.ts), and exporting the entry `satisfies ChangeEntry`. Skip refactors, CI, tests and docs.
// `at` is the squash-merge time of the pull request (the last one when several are folded together), in Vietnam time (+07:00).
// `audience: 'admin'` hides the entry from members (and `kind: 'ops'` is only for such entries). Never write secrets, emails,
// staff names or internal host names here. Everything an entry holds is shown to the reader, and an entry shows its `prs` to Admins only.

import { ENTRIES } from './changelog-entries';

export type ChangeKind = 'new' | 'improved' | 'fixed' | 'ops';

export interface ChangeEntry {
  /** When it went live: an ISO time with the Vietnam offset. Unique, as it doubles as the id and the seen mark. */
  at: string;
  kind: ChangeKind;
  title: string;
  /** One to three short sentences. */
  details: string[];
  /** The page it is about, such as /apps/ai-fashion-model. */
  href?: string;
  /** The pull requests behind it. */
  prs: number[];
  /** Board items (/feedback/<id>) it answers: each item's page lists it as an update that shipped what was asked. */
  feedback?: string[];
  audience: 'all' | 'admin';
}

export const KIND_LABEL: Record<ChangeKind, string> = { new: 'Mới', improved: 'Cải tiến', fixed: 'Sửa lỗi', ops: 'Vận hành' };

/** Every entry, newest first: changelog-entries/index.ts is generated from the entry files (scripts/changelog-index.ts). */
export const CHANGELOG: ChangeEntry[] = ENTRIES;
