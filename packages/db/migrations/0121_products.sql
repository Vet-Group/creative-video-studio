CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"store_id" text,
	"product_type" text,
	"asset_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_name_check" CHECK (char_length("products"."name") between 1 and 60),
	CONSTRAINT "products_photos_check" CHECK (cardinality("products"."asset_ids") between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_user_name_key" ON "products" USING btree ("user_id","workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "products_workspace_id_idx" ON "products" USING btree ("workspace_id");