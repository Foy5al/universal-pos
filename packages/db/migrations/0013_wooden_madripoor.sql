CREATE TABLE "pos_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"require_removal_password" boolean DEFAULT false NOT NULL,
	"removal_password_salt" text,
	"removal_password_hash" text,
	"removal_password_iterations" integer DEFAULT 120000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_settings_removal_password_required" CHECK (not "pos_settings"."require_removal_password" or ("pos_settings"."removal_password_salt" is not null and "pos_settings"."removal_password_hash" is not null)),
	CONSTRAINT "pos_settings_removal_password_iterations_positive" CHECK ("pos_settings"."removal_password_iterations" > 0)
);
--> statement-breakpoint
ALTER TABLE "pos_settings" ADD CONSTRAINT "pos_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;