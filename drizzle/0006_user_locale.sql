ALTER TABLE "user_settings" ADD COLUMN "locale" text DEFAULT 'et' NOT NULL;--> statement-breakpoint
-- Keep values in sync with SUPPORTED_LOCALES in db/schema.ts. When adding
-- a locale, drop and re-add the constraint rather than editing in place.
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_locale_check"
  CHECK ("locale" IN ('et', 'en'));