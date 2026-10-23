-- Every account is created by an Admin, so every existing email counts as verified (D.1). Without it, the first social sign-in of
-- an existing user is refused with account_not_linked, because better-auth requires the local email to be verified before it links.
UPDATE "users" SET "email_verified" = true WHERE NOT "email_verified";
