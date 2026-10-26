ALTER TABLE "jobs" ADD COLUMN "enhance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "enhanced_prompt" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "enhance_cost_usd" numeric(10, 6);