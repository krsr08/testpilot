import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { testpilotPrisma?: PrismaClient };

export const db = globalForPrisma.testpilotPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.testpilotPrisma = db;

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-000000000002';
export const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000003';
