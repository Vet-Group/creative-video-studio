-- Store brand kit (owner decision, 2026-11-04): a store's brand voice, colours and tagline, which Marketing Studio and Image Generation add to the
-- prompt when the member turns on the brand kit switch. Numbered 0067: 0065 and 0066 are taken by branches not yet merged.
ALTER TABLE "stores" ADD COLUMN "brand_voice" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "brand_colors" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "brand_tagline" text;