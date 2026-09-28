ALTER TABLE "IntegrationConnection" ADD COLUMN "credentialRef" TEXT NOT NULL DEFAULT '';
CREATE TABLE "IntegrationSyncConflict" (
  "id" UUID NOT NULL,
  "integrationId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "externalId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "localRevision" TEXT NOT NULL,
  "remoteRevision" TEXT NOT NULL,
  "localSnapshot" JSONB NOT NULL DEFAULT '{}',
  "remoteSnapshot" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "resolvedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "IntegrationSyncConflict_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationSyncConflict_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IntegrationSyncConflict_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "IntegrationSyncConflict_projectId_status_createdAt_idx" ON "IntegrationSyncConflict"("projectId", "status", "createdAt");
CREATE INDEX "IntegrationSyncConflict_integrationId_externalId_idx" ON "IntegrationSyncConflict"("integrationId", "externalId");
