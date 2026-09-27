CREATE TABLE "WorkspaceSubscription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "workspaceId" UUID NOT NULL, "plan" TEXT NOT NULL DEFAULT 'free',
  "status" TEXT NOT NULL DEFAULT 'active', "stripeCustomerId" TEXT, "stripeSubscriptionId" TEXT,
  "currentPeriodEnd" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WorkspaceSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceSubscription_workspaceId_key" ON "WorkspaceSubscription"("workspaceId");
CREATE UNIQUE INDEX "WorkspaceSubscription_stripeCustomerId_key" ON "WorkspaceSubscription"("stripeCustomerId");
CREATE UNIQUE INDEX "WorkspaceSubscription_stripeSubscriptionId_key" ON "WorkspaceSubscription"("stripeSubscriptionId");
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
