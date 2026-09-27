ALTER TABLE "Project" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'APPLICATION';
CREATE INDEX "Project_createdBy_updatedAt_idx" ON "Project"("createdBy", "updatedAt");
