import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const userId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const organizationId = '00000000-0000-4000-8000-000000000010';

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.organization.upsert({ where: { id: organizationId }, update: {}, create: { id: organizationId, name: 'Demo Organization', slug: 'demo' } });
    await tx.user.upsert({
      where: { id: userId }, update: {},
      create: { id: userId, email: 'demo@testpilot.local', name: 'Demo Tester' },
    });
    await tx.workspace.upsert({
      where: { id: workspaceId }, update: {},
      create: { id: workspaceId, organizationId, name: 'Demo Workspace' },
    });
    await tx.membership.upsert({
      where: { workspaceId_userId: { workspaceId, userId } }, update: {},
      create: { workspaceId, userId, role: 'ADMIN' },
    });
    await tx.workspaceSubscription.upsert({where:{workspaceId},update:{plan:'pro',status:'active'},create:{workspaceId,plan:'pro',status:'active'}});
    await tx.project.upsert({
      where: { id: projectId }, update: {},
      create: {
        id: projectId, workspaceId, name: 'Login & Password Reset',
        description: 'Explore the full review journey with the supplied login and password-reset sample requirements.',
        domain: 'Account security', createdBy: userId, updatedBy: userId,
      },
    });
  });
  console.info('Demo workspace, user and sample project seeded.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
