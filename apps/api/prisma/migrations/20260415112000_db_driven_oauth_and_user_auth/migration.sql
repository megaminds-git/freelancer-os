-- DB-driven OAuth app configuration
ALTER TABLE "oauth_app_configs"
  ADD COLUMN IF NOT EXISTS "platform_name" TEXT,
  ADD COLUMN IF NOT EXISTS "client_id" TEXT,
  ADD COLUMN IF NOT EXISTS "client_secret" TEXT,
  ADD COLUMN IF NOT EXISTS "oauth_base_url" TEXT,
  ADD COLUMN IF NOT EXISTS "token_url" TEXT,
  ADD COLUMN IF NOT EXISTS "redirect_base_url" TEXT,
  ADD COLUMN IF NOT EXISTS "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "user_info_url" TEXT;

UPDATE "oauth_app_configs"
SET
  "platform_name" = COALESCE("platform_name", "platform"),
  "client_id" = COALESCE("client_id", "clientId"),
  "client_secret" = COALESCE("client_secret", "clientSecret"),
  "oauth_base_url" = COALESCE("oauth_base_url", "authorizeUrl"),
  "token_url" = COALESCE("token_url", "tokenUrl"),
  "user_info_url" = COALESCE("user_info_url", "userInfoUrl"),
  "redirect_base_url" = COALESCE("redirect_base_url", 'http://localhost:3001'),
  "scopes" = CASE
    WHEN "scopes" IS NULL OR array_length("scopes", 1) IS NULL THEN
      CASE
        WHEN "scope" IS NULL OR btrim("scope") = '' THEN ARRAY[]::TEXT[]
        ELSE regexp_split_to_array("scope", '\\s+')
      END
    ELSE "scopes"
  END;

ALTER TABLE "oauth_app_configs"
  ALTER COLUMN "platform_name" SET NOT NULL,
  ALTER COLUMN "client_id" SET NOT NULL,
  ALTER COLUMN "client_secret" SET NOT NULL,
  ALTER COLUMN "oauth_base_url" SET NOT NULL,
  ALTER COLUMN "token_url" SET NOT NULL,
  ALTER COLUMN "redirect_base_url" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_app_configs_platform_name_key" ON "oauth_app_configs"("platform_name");
CREATE INDEX IF NOT EXISTS "oauth_app_configs_platform_name_is_active_idx" ON "oauth_app_configs"("platform_name", "is_active");

-- Per-user platform auth storage
ALTER TABLE "platform_connections"
  ADD COLUMN IF NOT EXISTS "session_token" TEXT,
  ADD COLUMN IF NOT EXISTS "cookies" TEXT,
  ADD COLUMN IF NOT EXISTS "platform_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
  ADD COLUMN IF NOT EXISTS "connected_account_status" TEXT DEFAULT 'connected' NOT NULL,
  ADD COLUMN IF NOT EXISTS "expiry_time" TIMESTAMP(3);

UPDATE "platform_connections"
SET
  "platform_user_id" = COALESCE("platform_user_id", "externalId"),
  "expiry_time" = COALESCE("expiry_time", "expiresAt")
WHERE "platform_user_id" IS NULL OR "expiry_time" IS NULL;
