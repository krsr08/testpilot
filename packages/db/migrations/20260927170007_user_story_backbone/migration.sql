-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "storyId" UUID;

-- AlterTable
ALTER TABLE "TestCase" ADD COLUMN     "executionType" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "UserStory" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "stableCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "sourceSpanRef" JSONB NOT NULL,
    "critiqueStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "critiqueReason" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "reviewerId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentStoryId" UUID,
    "createdBy" UUID NOT NULL,
    "authorKind" TEXT NOT NULL DEFAULT 'USER',
    "updatedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "UserStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryRequirementLink" (
    "storyId" UUID NOT NULL,
    "requirementId" UUID NOT NULL,
    "sourceSpanRef" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryRequirementLink_pkey" PRIMARY KEY ("storyId","requirementId")
);

-- CreateTable
CREATE TABLE "UserStoryRevision" (
    "id" UUID NOT NULL,
    "storyId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStoryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalLink" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "storyId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "externalSystem" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SYNCED',

    CONSTRAINT "ExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserStory_projectId_state_updatedAt_idx" ON "UserStory"("projectId", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "UserStory_reviewerId_state_updatedAt_idx" ON "UserStory"("reviewerId", "state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserStory_projectId_stableCode_key" ON "UserStory"("projectId", "stableCode");

-- CreateIndex
CREATE INDEX "StoryRequirementLink_requirementId_idx" ON "StoryRequirementLink"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStoryRevision_storyId_version_key" ON "UserStoryRevision"("storyId", "version");

-- CreateIndex
CREATE INDEX "ExternalLink_projectId_entityType_entityId_idx" ON "ExternalLink"("projectId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalLink_externalSystem_externalId_key" ON "ExternalLink"("externalSystem", "externalId");

-- AddForeignKey
ALTER TABLE "UserStory" ADD CONSTRAINT "UserStory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStory" ADD CONSTRAINT "UserStory_parentStoryId_fkey" FOREIGN KEY ("parentStoryId") REFERENCES "UserStory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryRequirementLink" ADD CONSTRAINT "StoryRequirementLink_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "UserStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryRequirementLink" ADD CONSTRAINT "StoryRequirementLink_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoryRevision" ADD CONSTRAINT "UserStoryRevision_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "UserStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "UserStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "UserStory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserStory" ADD CONSTRAINT "UserStory_state_check" CHECK ("state" IN ('DRAFT','IN_REVIEW','APPROVED','REJECTED','ARCHIVED','BLOCKED','NEEDS_REVIEW'));
ALTER TABLE "UserStory" ADD CONSTRAINT "UserStory_critique_check" CHECK ("critiqueStatus" IN ('PENDING','GROUNDED','PARTIAL','UNSUPPORTED'));
ALTER TABLE "UserStory" ADD CONSTRAINT "UserStory_author_check" CHECK ("authorKind" IN ('USER','AI_AGENT'));
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_execution_type_check" CHECK ("executionType" IN ('MANUAL','AUTOMATION','API','PERFORMANCE'));
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_status_check" CHECK ("status" IN ('SYNCED','PENDING','CONFLICT','FAILED'));
