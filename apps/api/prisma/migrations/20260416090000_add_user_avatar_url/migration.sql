-- Add avatar URL to users for profile photo uploads.
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
