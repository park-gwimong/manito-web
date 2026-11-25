ALTER TABLE "events" ADD COLUMN "mission_mode" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "mission_hour" integer DEFAULT 9 NOT NULL;