CREATE TYPE "public"."stock_loss_reason" AS ENUM('damaged', 'defective', 'expired', 'lost', 'other');--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "loss_reason" "stock_loss_reason";--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "expires_on" date;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "unit_cost_minor" integer;--> statement-breakpoint
CREATE INDEX "stock_movements_org_loss_reason_idx" ON "stock_movements" USING btree ("organization_id","loss_reason","occurred_at");