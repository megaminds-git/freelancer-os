-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "avatarUrl" TEXT,
    "googleId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skills" TEXT[],
    "experience" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platforms" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "components" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposal_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_components" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectTitle" TEXT NOT NULL,
    "projectDescription" TEXT NOT NULL,
    "clientCountry" TEXT NOT NULL DEFAULT 'Unknown',
    "clientTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "techStack" TEXT[],
    "bidAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "platform" TEXT NOT NULL DEFAULT 'upwork',
    "isReference" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "clientCountry" TEXT NOT NULL DEFAULT 'Unknown',
    "clientTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "techStack" TEXT[],
    "bidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platform" TEXT NOT NULL DEFAULT 'upwork',
    "url" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectTitle" TEXT NOT NULL,
    "projectDescription" TEXT NOT NULL,
    "recommendedStructure" TEXT[],
    "biddingStrategy" TEXT NOT NULL,
    "effortLevel" TEXT NOT NULL,
    "hoursEstimate" INTEGER NOT NULL,
    "techFitScore" INTEGER NOT NULL,
    "matchedSkills" TEXT[],
    "bidRangeMin" DOUBLE PRECISION NOT NULL,
    "bidRangeMax" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "redFlags" TEXT[],
    "winningAngle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "headlineScore" INTEGER NOT NULL,
    "bioScore" INTEGER NOT NULL,
    "skillsScore" INTEGER NOT NULL,
    "portfolioScore" INTEGER NOT NULL,
    "completenessScore" INTEGER NOT NULL,
    "improvements" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "countries" TEXT[],
    "timezones" TEXT[],
    "activeHoursStart" INTEGER NOT NULL DEFAULT 8,
    "activeHoursEnd" INTEGER NOT NULL DEFAULT 20,
    "notificationChannels" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposalId" TEXT,
    "s3Key" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "externalId" TEXT,
    "email" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE INDEX "proposal_templates_userId_createdAt_idx" ON "proposal_templates"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "template_components_userId_type_idx" ON "template_components"("userId", "type");

-- CreateIndex
CREATE INDEX "proposals_userId_createdAt_idx" ON "proposals"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "project_records_userId_scrapedAt_idx" ON "project_records"("userId", "scrapedAt");

-- CreateIndex
CREATE INDEX "ai_analyses_userId_createdAt_idx" ON "ai_analyses"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "profile_reviews_userId_createdAt_idx" ON "profile_reviews"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alert_configs_userId_key" ON "alert_configs"("userId");

-- CreateIndex
CREATE INDEX "files_userId_idx" ON "files"("userId");

-- CreateIndex
CREATE INDEX "analytics_events_userId_eventType_createdAt_idx" ON "analytics_events"("userId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "platform_connections_userId_platform_idx" ON "platform_connections"("userId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "platform_connections_userId_platform_key" ON "platform_connections"("userId", "platform");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_templates" ADD CONSTRAINT "proposal_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_components" ADD CONSTRAINT "template_components_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_records" ADD CONSTRAINT "project_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_reviews" ADD CONSTRAINT "profile_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_configs" ADD CONSTRAINT "alert_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
