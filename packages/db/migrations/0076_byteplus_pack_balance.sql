-- Owner decision 2026-11-06: Admin Costs shows the remaining BytePlus ModelArk Seedance 2.0 prepaid resource pack. BytePlus has no working API for a pack's remaining amount on the
-- international site (ListResourcePackages and ListPackageUsageDetails answer HTTP 500, checked 2026-11-06), so the app computes it: the Admin enters the tokens left at a moment
-- (settings.byteplus_pack_*) and the app subtracts the tokens the finished jobs of the pack's one model, seedance-2.0-byteplus, were billed after that moment (jobs.provider_tokens,
-- BytePlus's usage.completion_tokens). Seedance 2.0 fast, 2.0 mini and 2.5 are pay-as-you-go and not covered by the pack.
-- Seed, read from the BytePlus billing API 2026-11-06 about 09:50 +07:00: 7 x "Dreamina_Seedance_2.0_pack_1000ktokens" = 7,000,000 tokens bought 2026-11-04 11:17 +08:00, expiring
-- 2027-02-01 23:59:59 +08:00; the bill details showed 108,900 tokens deducted (one canary run outside CVS on 2026-11-04), so 6,891,100 tokens were left.
ALTER TABLE "jobs" ADD COLUMN "provider_tokens" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "byteplus_pack_total_tokens" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "byteplus_pack_tokens" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "byteplus_pack_as_of" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "byteplus_pack_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_byteplus_pack_check" CHECK (("settings"."byteplus_pack_total_tokens" is null) = ("settings"."byteplus_pack_tokens" is null) and ("settings"."byteplus_pack_total_tokens" is null) = ("settings"."byteplus_pack_as_of" is null) and ("settings"."byteplus_pack_total_tokens" is null) = ("settings"."byteplus_pack_expires_at" is null)
        and ("settings"."byteplus_pack_total_tokens" is null or ("settings"."byteplus_pack_total_tokens" > 0 and "settings"."byteplus_pack_tokens" between 0 and "settings"."byteplus_pack_total_tokens")));--> statement-breakpoint
UPDATE "settings" SET "byteplus_pack_total_tokens" = 7000000, "byteplus_pack_tokens" = 6891100, "byteplus_pack_as_of" = '2026-11-06T02:50:00Z', "byteplus_pack_expires_at" = '2027-02-01T15:59:59Z', "updated_at" = now() WHERE "id" = 1;
