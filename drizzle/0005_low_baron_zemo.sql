ALTER TABLE "mission_deliveries" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mission_deliveries" ADD COLUMN "options" jsonb;