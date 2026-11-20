// Billing teams (docs/BILLING.md, owner decisions 2026-11-20): a member of a billing team runs company jobs only for that team's stores.
import { COMPANY_WORKSPACE_ID } from '@cvs/db';

/** The `code` of the API's refusal of another team's store; lib/api.ts errorText shows it to the member in Vietnamese. */
export const STORE_TEAM_CODE = 'store_not_in_team';

/**
 * SQL that is true when the store under alias `s` may take a job of the user in parameter `user`: always, unless the user is in a billing team
 * (Admins too) and it is a company store of another team or of none. A partner workspace's store has no team, and its jobs are the partner's.
 */
export const storeAllowed = (s: string, user: string) =>
  `not exists (select 1 from users bu join teams bt on bt.id = bu.team_id
                where bu.id = ${user} and bt.billable and ${s}.workspace_id = '${COMPANY_WORKSPACE_ID}' and ${s}.team_id is distinct from bu.team_id)`;
