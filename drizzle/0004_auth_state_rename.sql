-- Rename status enum values + drop the verification_code column we stopped
-- populating. The old values were an arbitrary choice that confused us; the
-- new names mirror the UI vocabulary (unauthenticated/loading/authenticated).
ALTER TABLE "praamid_auth_state" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
UPDATE "praamid_auth_state" SET "status" = 'unauthenticated' WHERE "status" = 'disconnected';--> statement-breakpoint
UPDATE "praamid_auth_state" SET "status" = 'loading' WHERE "status" = 'connecting';--> statement-breakpoint
UPDATE "praamid_auth_state" SET "status" = 'authenticated' WHERE "status" = 'connected';--> statement-breakpoint
ALTER TABLE "praamid_auth_state" ALTER COLUMN "status" SET DEFAULT 'unauthenticated';--> statement-breakpoint
ALTER TABLE "praamid_auth_state" DROP COLUMN "verification_code";
