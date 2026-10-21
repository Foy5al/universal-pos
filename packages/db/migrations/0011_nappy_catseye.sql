CREATE TABLE "low_stock_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"global_threshold" numeric(18, 4),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "low_stock_settings_global_threshold_non_negative" CHECK ("low_stock_settings"."global_threshold" is null or "low_stock_settings"."global_threshold" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "low_stock_threshold" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "low_stock_settings" ADD CONSTRAINT "low_stock_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_low_stock_threshold_non_negative" CHECK ("products"."low_stock_threshold" is null or "products"."low_stock_threshold" >= 0);