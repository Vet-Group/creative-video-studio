ALTER TABLE "analyses" ADD COLUMN "shared_title" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "analyses_shared_at_idx" ON "analyses" USING btree ("shared_at") WHERE "analyses"."shared_at" is not null;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_shared_check" CHECK (("analyses"."shared_title" is null) = ("analyses"."shared_at" is null));