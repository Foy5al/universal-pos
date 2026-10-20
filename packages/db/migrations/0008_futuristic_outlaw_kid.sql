CREATE TYPE "public"."restock_request_status" AS ENUM('pending', 'scheduled', 'fulfilled', 'dismissed');--> statement-breakpoint
CREATE TABLE "restock_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"requested_by_name" text NOT NULL,
	"requested_quantity" numeric(18, 4) NOT NULL,
	"note" text,
	"status" "restock_request_status" DEFAULT 'pending' NOT NULL,
	"purchase_order_id" uuid,
	"purchase_order_line_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_sku" text,
	"unit_cost_minor" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "restock_requests_org_status_idx" ON "restock_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "restock_requests_org_location_idx" ON "restock_requests" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE INDEX "restock_requests_org_order_idx" ON "restock_requests" USING btree ("organization_id","purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_products_supplier_product_uq" ON "supplier_products" USING btree ("supplier_id","product_id");--> statement-breakpoint
CREATE INDEX "supplier_products_org_supplier_idx" ON "supplier_products" USING btree ("organization_id","supplier_id");--> statement-breakpoint
INSERT INTO "permissions" ("key", "description") VALUES ('restock:request', 'Request stock replenishment') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT DISTINCT "role_id", 'restock:request' FROM "role_permissions"
WHERE "permission_key" IN ('sales:create', 'purchases:manage')
ON CONFLICT DO NOTHING;
