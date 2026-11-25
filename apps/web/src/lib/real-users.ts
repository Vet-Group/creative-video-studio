/** A real user is a non-system account whose team is not excluded from reports; `t` is `teams` left-joined on `${u}.team_id`. */
export const realUserSql = (u = 'u', t = 't'): string => `(not ${u}.system and not coalesce(${t}.excluded_from_reports, false))`;
