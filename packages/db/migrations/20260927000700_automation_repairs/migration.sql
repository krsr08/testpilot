CREATE TABLE "AutomationRepairSuggestion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "artifactId" UUID NOT NULL, "failedSelector" JSONB NOT NULL,
  "workingSelector" JSONB NOT NULL, "proposedSource" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
  "createdBy" UUID NOT NULL, "reviewedBy" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3), CONSTRAINT "AutomationRepairSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AutomationRepairSuggestion_artifactId_status_createdAt_idx" ON "AutomationRepairSuggestion"("artifactId", "status", "createdAt");
ALTER TABLE "AutomationRepairSuggestion" ADD CONSTRAINT "AutomationRepairSuggestion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AutomationArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
