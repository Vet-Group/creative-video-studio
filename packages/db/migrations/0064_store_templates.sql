-- Store templates (owner decision, 2026-11-04): a saved template may be shared with one store, seen by every member who picks that store on the form.
-- A template is personal, of one store or of the company, never both a store's and the company's.
ALTER TABLE "user_templates" ADD COLUMN "store_id" text;--> statement-breakpoint
ALTER TABLE "user_templates" ADD CONSTRAINT "user_templates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_templates_store_id_idx" ON "user_templates" USING btree ("store_id");--> statement-breakpoint
ALTER TABLE "user_templates" ADD CONSTRAINT "user_templates_scope_check" CHECK (not ("user_templates"."is_company" and "user_templates"."store_id" is not null));