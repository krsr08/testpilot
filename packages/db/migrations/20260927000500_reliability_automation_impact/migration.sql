CREATE TABLE "FeedbackEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "projectId" UUID NOT NULL, "testCaseId" UUID,
  "category" TEXT NOT NULL, "disposition" TEXT NOT NULL, "original" JSONB, "corrected" JSONB,
  "note" TEXT NOT NULL DEFAULT '', "createdBy" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedbackEvent_projectId_category_createdAt_idx" ON "FeedbackEvent"("projectId", "category", "createdAt");
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AutomationArtifact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "projectId" UUID NOT NULL, "testCaseId" UUID NOT NULL,
  "framework" TEXT NOT NULL DEFAULT 'playwright', "filename" TEXT NOT NULL, "source" TEXT NOT NULL,
  "selectors" JSONB NOT NULL DEFAULT '[]', "status" TEXT NOT NULL DEFAULT 'draft', "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" UUID NOT NULL, "updatedBy" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AutomationArtifact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationArtifact_testCaseId_framework_key" ON "AutomationArtifact"("testCaseId", "framework");
CREATE INDEX "AutomationArtifact_projectId_updatedAt_idx" ON "AutomationArtifact"("projectId", "updatedAt");
ALTER TABLE "AutomationArtifact" ADD CONSTRAINT "AutomationArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationArtifact" ADD CONSTRAINT "AutomationArtifact_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RequirementChangeSet" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "projectId" UUID NOT NULL, "fromSnapshot" TEXT,
  "toSnapshot" TEXT NOT NULL, "summary" JSONB NOT NULL, "changes" JSONB NOT NULL, "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RequirementChangeSet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RequirementChangeSet_projectId_toSnapshot_key" ON "RequirementChangeSet"("projectId", "toSnapshot");
CREATE INDEX "RequirementChangeSet_projectId_createdAt_idx" ON "RequirementChangeSet"("projectId", "createdAt");
ALTER TABLE "RequirementChangeSet" ADD CONSTRAINT "RequirementChangeSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
