CREATE TABLE "OrganizationDeploymentConfig" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "values" JSONB NOT NULL DEFAULT '{}',
  "updatedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationDeploymentConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationDeploymentConfig_organizationId_key" UNIQUE ("organizationId"),
  CONSTRAINT "OrganizationDeploymentConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
