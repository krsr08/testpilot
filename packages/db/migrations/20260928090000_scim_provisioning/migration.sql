ALTER TABLE "User"
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "provisioningSource" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

ALTER TABLE "User" ADD CONSTRAINT "User_provisioningSource_check"
  CHECK ("provisioningSource" IN ('MANUAL', 'SCIM', 'OIDC', 'DEMO'));
