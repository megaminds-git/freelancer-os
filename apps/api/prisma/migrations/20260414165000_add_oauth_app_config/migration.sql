-- CreateTable
CREATE TABLE "oauth_app_configs" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "authorizeUrl" TEXT NOT NULL,
    "tokenUrl" TEXT NOT NULL,
    "userInfoUrl" TEXT,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_app_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_app_configs_platform_key" ON "oauth_app_configs"("platform");

-- CreateIndex
CREATE INDEX "oauth_app_configs_platform_idx" ON "oauth_app_configs"("platform");
