-- Stored credentials now hold the Keycloak refresh_token (~7-day lifetime)
-- instead of the access_token (now only 5 min). Existing rows are useless —
-- truncate so we don't keep stale encrypted access tokens that the new code
-- would try to treat as refresh tokens.
TRUNCATE TABLE "praamid_credentials";--> statement-breakpoint
ALTER TABLE "praamid_credentials" RENAME COLUMN "access_token_enc" TO "refresh_token_enc";
