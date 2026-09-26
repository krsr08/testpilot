import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Prisma } from '@prisma/client';
import { db } from '../../packages/db';
import { storagePath } from '../../apps/web/lib/storage';
import { buildTraceability } from '../../apps/web/lib/traceability';
import { ProcessingError } from './extraction';

const execute = promisify(execFile);

export async function createExportPayload(projectId: string, approvedOnly: boolean) {
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const sources = await tx.sourceDocument.findMany({ where: { projectId, deletedAt: null }, select: { id: true, filename: true }, orderBy: { createdAt: 'asc' } });
    const traceability = await buildTraceability(projectId, approvedOnly, tx);
    const cases = await tx.testCase.findMany({
      where: { projectId, deletedAt: null, ...(approvedOnly ? { status: 'approved' } : {}) },
      include: { steps: { orderBy: { position: 'asc' } }, links: { include: { requirement: true } }, scenario: true, run: true },
      orderBy: { stableCode: 'asc' },
    });
    const citations = cases.length ? await tx.sourceCitation.findMany({ where: { entityType: 'test_case', entityId: { in: cases.map(testCase => testCase.id) } }, include: { source: { select: { filename: true } } } }) : [];
    const scenarios = await tx.scenario.findMany({ where: { projectId, ...(approvedOnly ? { id: { in: cases.flatMap(testCase => testCase.scenarioId ? [testCase.scenarioId] : []) } } : {}) }, orderBy: { stableCode: 'asc' } });
    const overallCases = await tx.testCase.count({ where: { projectId, deletedAt: null } });
    const requirements = traceability.rows.map(row => ({ ...row.requirement, source: row.requirement.source?.filename ?? 'Manual' }));
    const rtm = traceability.rows.flatMap(row => {
      const linked = cases.filter(testCase => testCase.links.some(link => link.requirementId === row.requirement.id));
      const common = { requirementId: row.requirement.stableCode, requirementText: row.requirement.text, coverage: row.requirement.included ? row.coverage : 'out of scope' };
      const entries = linked.map(testCase => ({ ...common, scenarioId: testCase.scenario?.stableCode ?? '', caseId: testCase.stableCode, caseStatus: testCase.status }));
      if (linked.length === 0 || (row.requirement.included && row.coverage === 'uncovered')) entries.push({ ...common, scenarioId: '', caseId: '', caseStatus: '' });
      return entries;
    });
    return {
      project: { id: project.id, name: project.name, description: project.description },
      exportedAt: new Date().toISOString(), approvedOnly, sources, requirements,
      scenarios: scenarios.map(scenario => ({ ...scenario, requirementIds: [...new Set(cases.filter(testCase => testCase.scenarioId === scenario.id).flatMap(testCase => testCase.links.map(link => link.requirement.stableCode)))] })),
      cases: cases.map(testCase => ({ ...testCase, citations: citations.filter(citation => citation.entityId === testCase.id), requirementIds: testCase.links.map(link => link.requirement.stableCode) })),
      rtm, warnings: traceability.warnings,
      counts: { ...traceability.counts, overallCases, cases: cases.length, rejected: cases.filter(testCase => testCase.status === 'rejected').length, stale: cases.filter(testCase => testCase.stale).length },
      providers: [...new Set(cases.map(testCase => testCase.run?.provider ?? 'manual'))],
      runs: [...new Map(cases.filter(testCase => testCase.run).map(testCase => [testCase.run!.id, { id: testCase.run!.id, provider: testCase.run!.provider, model: testCase.run!.modelId, promptVersion: testCase.run!.promptVersion }])).values()],
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}

export async function buildExport(jobId: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  const record = await db.export.findUniqueOrThrow({ where: { id: job.entityId } });
  if (record.status === 'succeeded' && record.storageKey && record.expiresAt && record.expiresAt > new Date()) return;
  const key = `${randomUUID()}.xlsx`;
  const inputKey = `${randomUUID()}.json`;
  try {
    await db.export.update({ where: { id: record.id }, data: { status: 'running', error: null } });
    await db.job.update({ where: { id: jobId }, data: { stage: 'snapshotting reviewed data', progress: 20 } });
    const payload = await createExportPayload(record.projectId, record.approvedOnly);
    const slug = payload.project.name.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'project';
    const filename = `TestPilot_${slug}_${payload.exportedAt.slice(0, 10)}.xlsx`;
    await mkdir(path.dirname(storagePath(key)), { recursive: true });
    await writeFile(storagePath(inputKey), JSON.stringify(payload), { encoding: 'utf8', flag: 'wx' });
    await db.job.update({ where: { id: jobId }, data: { stage: 'building six-sheet workbook', progress: 65 } });
    await execute(process.env.PYTHON_BIN || 'python', [path.resolve('services/worker/export.py'), storagePath(inputKey), storagePath(key)], { timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true });
    await db.$transaction([
      db.export.update({ where: { id: record.id }, data: { status: 'succeeded', storageKey: key, filename, error: null, completedAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }),
      db.auditEvent.create({ data: { projectId: record.projectId, actorId: job.createdBy, action: 'export_created', entityType: 'export', entityId: record.id, afterJson: { approvedOnly: record.approvedOnly, caseCount: payload.cases.length, sheetCount: 6 } } }),
    ]);
  } catch (error) {
    await rm(storagePath(key), { force: true });
    const message = 'Workbook could not be created. Confirm the Python export dependencies and available disk space, then retry.';
    await db.export.update({ where: { id: record.id }, data: { status: 'failed', error: message } });
    throw new ProcessingError(message, { cause: error });
  } finally {
    await rm(storagePath(inputKey), { force: true });
  }
}

let cleaning = false;
export async function cleanupExpiredExports() {
  if (cleaning) return;
  cleaning = true;
  try {
    const expired = await db.export.findMany({ where: { status: 'succeeded', expiresAt: { lt: new Date() } }, take: 100 });
    for (const record of expired) {
      if (record.storageKey && /^[0-9a-f-]{36}\.xlsx$/i.test(record.storageKey)) await rm(storagePath(record.storageKey), { force: true });
      await db.export.update({ where: { id: record.id }, data: { status: 'expired', storageKey: null } });
    }
  } finally { cleaning = false; }
}
