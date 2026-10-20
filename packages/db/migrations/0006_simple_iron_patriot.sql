ALTER TYPE "public"."stock_movement_type" ADD VALUE 'return';--> statement-breakpoint
CREATE TABLE "refund_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"line_total_minor" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"register_shift_id" uuid NOT NULL,
	"refund_number" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refund_lines" ADD CONSTRAINT "refund_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_lines" ADD CONSTRAINT "refund_lines_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_lines" ADD CONSTRAINT "refund_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_register_shift_id_register_shifts_id_fk" FOREIGN KEY ("register_shift_id") REFERENCES "public"."register_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refund_lines_refund_idx" ON "refund_lines" USING btree ("refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_org_operation_uq" ON "refunds" USING btree ("organization_id","operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_org_number_uq" ON "refunds" USING btree ("organization_id","refund_number");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_org_sale_uq" ON "refunds" USING btree ("organization_id","sale_id");--> statement-breakpoint
CREATE INDEX "refunds_org_shift_idx" ON "refunds" USING btree ("organization_id","register_shift_id");