CREATE TABLE "RequirementDocument" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "templateType" TEXT NOT NULL DEFAULT 'SIMPLE_PRD',
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" UUID NOT NULL,
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequirementDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequirementDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RequirementDocumentRevision" (
  "id" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequirementDocumentRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequirementDocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RequirementDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RequirementDocument_projectId_updatedAt_idx" ON "RequirementDocument"("projectId", "updatedAt");
CREATE INDEX "RequirementDocumentRevision_documentId_createdAt_idx" ON "RequirementDocumentRevision"("documentId", "createdAt");
CREATE UNIQUE INDEX "RequirementDocumentRevision_documentId_version_key" ON "RequirementDocumentRevision"("documentId", "version");
