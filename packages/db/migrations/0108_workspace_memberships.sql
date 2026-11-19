-- Workspaces, phase 2 (docs/WORKSPACES.md §4): from this deploy on a user with no active membership is refused, and only the Lark sign-in,
-- POST /api/admin/users and the create-user script add a membership. A user created between migration 0106 and this deploy has none, so every
-- user with no membership at all joins the company's workspace, as 0106 filed every earlier user (an Admin as an owner). Running it again adds nothing.
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT 'ws_vet', u."id", CASE WHEN u."role" = 'admin' THEN 'owner' ELSE 'member' END
  FROM "users" u
 WHERE NOT EXISTS (SELECT 1 FROM "workspace_members" m WHERE m."user_id" = u."id")
ON CONFLICT DO NOTHING;
