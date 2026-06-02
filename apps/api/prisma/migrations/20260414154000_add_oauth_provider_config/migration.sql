-- CreateTable
CREATE TABLE "oauth_provider_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "authorizeUrl" TEXT NOT NULL,
    "tokenUrl" TEXT NOT NULL,
    "userInfoUrl" TEXT,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_provider_configs_userId_platform_key" ON "oauth_provider_configs"("userId", "platform");

-- CreateIndex
CREATE INDEX "oauth_provider_configs_userId_platform_idx" ON "oauth_provider_configs"("userId", "platform");

-- AddForeignKey
ALTER TABLE "oauth_provider_configs" ADD CONSTRAINT "oauth_provider_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
