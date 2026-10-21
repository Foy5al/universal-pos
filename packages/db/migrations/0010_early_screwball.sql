ALTER TABLE "sync_conflicts" ADD COLUMN "cashier_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_conflicts_org_status_created_idx" ON "sync_conflicts" USING btree ("organization_id","status","created_at");