CREATE TYPE "public"."cash_movement_type" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."register_shift_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"type" "cash_movement_type" NOT NULL,
	"amount_minor" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "register_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"status" "register_shift_status" DEFAULT 'open' NOT NULL,
	"opening_float_minor" integer DEFAULT 0 NOT NULL,
	"expected_cash_minor" integer,
	"counted_cash_minor" integer,
	"variance_minor" integer,
	"opened_by" uuid NOT NULL,
	"closed_by" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "register_shift_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_register_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."register_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_org_shift_idx" ON "cash_movements" USING btree ("organization_id","shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "register_shifts_register_open_uq" ON "register_shifts" USING btree ("register_id") WHERE "register_shifts"."status" = 'open';--> statement-breakpoint
CREATE INDEX "register_shifts_org_opened_idx" ON "register_shifts" USING btree ("organization_id","opened_at");--> statement-breakpoint
CREATE INDEX "register_shifts_org_register_idx" ON "register_shifts" USING btree ("organization_id","register_id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_register_shift_id_register_shifts_id_fk" FOREIGN KEY ("register_shift_id") REFERENCES "public"."register_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_org_shift_idx" ON "sales" USING btree ("organization_id","register_shift_id");