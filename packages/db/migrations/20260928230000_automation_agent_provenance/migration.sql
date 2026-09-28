ALTER TABLE "AutomationArtifact" ADD COLUMN "generatedByRunId" UUID, ADD COLUMN "verifiedByRunId" UUID;
ALTER TABLE "AutomationRepairSuggestion" ADD COLUMN "generatedByRunId" UUID;
CREATE INDEX "AutomationArtifact_generatedByRunId_idx" ON "AutomationArtifact"("generatedByRunId");
CREATE INDEX "AutomationArtifact_verifiedByRunId_idx" ON "AutomationArtifact"("verifiedByRunId");
CREATE INDEX "AutomationRepairSuggestion_generatedByRunId_idx" ON "AutomationRepairSuggestion"("generatedByRunId");
