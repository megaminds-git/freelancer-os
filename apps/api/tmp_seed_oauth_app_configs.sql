-- ============================================================
-- OAuth App Config Seed — replace placeholder values before running!
--
-- redirect_base_url = your API server base URL (no trailing slash)
--   Dev:  http://localhost:3001
--   Prod: https://api.yourapp.com
--
-- Callback URL format (register in each platform's dev console):
--   {redirect_base_url}/api/v1/connections/upwork/callback
--   {redirect_base_url}/api/v1/connections/freelancer/callback
--
-- Upwork authorize URL:     https://www.upwork.com/ab/account-security/oauth2/authorize
-- Freelancer authorize URL: https://accounts.freelancer.com/settings/authorize
-- ============================================================
INSERT INTO "oauth_app_configs" (
  "id",
  "platform_name",
  "client_id",
  "client_secret",
  "oauth_base_url",
  "token_url",
  "redirect_base_url",
  "user_info_url",
  "scopes",
  "is_active",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'cfg_upwork',
    'upwork',
    'YOUR_UPWORK_CLIENT_ID',        -- replace with real Upwork API key
    'YOUR_UPWORK_CLIENT_SECRET',    -- replace with real Upwork API secret
    'https://www.upwork.com/ab/account-security/oauth2/authorize',
    'https://www.upwork.com/api/v3/oauth2/token',
    'http://localhost:3001',
    'https://api.upwork.com/api/auth/v1/info.json',
    ARRAY['openid'],
    true,
    now(),
    now()
  ),
  (
    'cfg_freelancer',
    'freelancer',
    'YOUR_FREELANCER_CLIENT_ID',    -- replace with real Freelancer client_id
    'YOUR_FREELANCER_CLIENT_SECRET', -- replace with real Freelancer client_secret
    'https://accounts.freelancer.com/settings/authorize',
    'https://accounts.freelancer.com/oauth/token',
    'http://localhost:3001',
    'https://www.freelancer.com/api/users/0.1/self/?compact=true',
    ARRAY['basic', 'jobs:api', 'projects:read'],
    true,
    now(),
    now()
  )
ON CONFLICT ("platform_name")
DO UPDATE SET
  "client_id" = EXCLUDED."client_id",
  "client_secret" = EXCLUDED."client_secret",
  "oauth_base_url" = EXCLUDED."oauth_base_url",
  "token_url" = EXCLUDED."token_url",
  "redirect_base_url" = EXCLUDED."redirect_base_url",
  "user_info_url" = EXCLUDED."user_info_url",
  "scopes" = EXCLUDED."scopes",
  "is_active" = EXCLUDED."is_active",
  "updatedAt" = now();
-- ============================================================
-- OAuth App Config Seed
-- Replace placeholder values before running!
--
-- redirect_base_url = your API server base URL (no trailing slash)
--   e.g. http://localhost:3001   OR   https://api.yourapp.com
--
-- This URL + "/api/v1/connections/{platform}/callback"
-- must be registered as the OAuth callback in the platform's
-- developer console.
--
-- Upwork authorize URL:   https://www.upwork.com/ab/account-security/oauth2/authorize
-- Freelancer authorize URL: https://accounts.freelancer.com/settings/authorize
-- ============================================================
