CREATE TYPE "Role" AS ENUM ('ADMIN', 'QA_LEAD', 'TESTER', 'VIEWER');

CREATE TABLE "Organization" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "ssoDomain" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

INSERT INTO "Organization" ("id", "name", "slug", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000010', 'Demo Organization', 'demo', CURRENT_TIMESTAMP);

ALTER TABLE "User" ADD COLUMN "externalSubject" TEXT, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "User_externalSubject_key" ON "User"("externalSubject");
ALTER TABLE "Workspace" ADD COLUMN "organizationId" UUID;
UPDATE "Workspace" SET "organizationId"='00000000-0000-4000-8000-000000000010';
ALTER TABLE "Workspace" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Membership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "Role" USING CASE lower("role") WHEN 'owner' THEN 'ADMIN'::"Role" WHEN 'admin' THEN 'ADMIN'::"Role" WHEN 'qa_lead' THEN 'QA_LEAD'::"Role" WHEN 'viewer' THEN 'VIEWER'::"Role" ELSE 'TESTER'::"Role" END;
ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'TESTER';

CREATE TABLE "IntegrationConnection" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL, "baseUrl" TEXT NOT NULL, "projectKey" TEXT NOT NULL,
  "encryptedToken" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_kind_name_key" ON "IntegrationConnection"("organizationId", "kind", "name");
CREATE INDEX "IntegrationConnection_organizationId_idx" ON "IntegrationConnection"("organizationId");

CREATE TABLE "ExternalCaseLink" (
  "id" UUID NOT NULL, "testCaseId" UUID NOT NULL, "integrationId" UUID NOT NULL,
  "externalKey" TEXT NOT NULL, "externalUrl" TEXT NOT NULL, "contentHash" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalCaseLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExternalCaseLink_integrationId_externalKey_key" ON "ExternalCaseLink"("integrationId", "externalKey");
CREATE UNIQUE INDEX "ExternalCaseLink_testCaseId_integrationId_key" ON "ExternalCaseLink"("testCaseId", "integrationId");
