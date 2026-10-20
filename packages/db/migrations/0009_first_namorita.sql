CREATE TYPE "public"."sync_operation_status" AS ENUM('accepted', 'duplicate', 'needs_review', 'rejected');--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" text DEFAULT 'sale' NOT NULL,
	"event_type" text NOT NULL,
	"client_sequence" integer NOT NULL,
	"status" "sync_operation_status" NOT NULL,
	"sale_id" uuid,
	"conflict_reason" text,
	"message" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_conflicts_org_operation_uq" ON "sync_conflicts" USING btree ("organization_id","operation_id");--> statement-breakpoint
CREATE INDEX "sync_conflicts_org_created_idx" ON "sync_conflicts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_operations_org_operation_uq" ON "sync_operations" USING btree ("organization_id","operation_id");--> statement-breakpoint
CREATE INDEX "sync_operations_org_device_sequence_idx" ON "sync_operations" USING btree ("organization_id","device_id","sequence");