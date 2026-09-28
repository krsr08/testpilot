ALTER TABLE "UserStory" ADD COLUMN "generatedByRunId" UUID, ADD COLUMN "verifiedByRunId" UUID;
ALTER TABLE "Scenario" ADD COLUMN "generatedByRunId" UUID, ADD COLUMN "verifiedByRunId" UUID;
ALTER TABLE "TestCase" ADD COLUMN "generatedByRunId" UUID, ADD COLUMN "verifiedByRunId" UUID;
CREATE INDEX "UserStory_generatedByRunId_idx" ON "UserStory"("generatedByRunId");
CREATE INDEX "Scenario_generatedByRunId_idx" ON "Scenario"("generatedByRunId");
CREATE INDEX "TestCase_generatedByRunId_idx" ON "TestCase"("generatedByRunId");
