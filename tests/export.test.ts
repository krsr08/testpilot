import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { db, DEMO_USER_ID, DEMO_WORKSPACE_ID } from '../packages/db';
import { buildExport, cleanupExpiredExports, createExportPayload } from '../services/worker/export';
import { storagePath } from '../apps/web/lib/storage';

afterAll(async () => { await db.$disconnect(); });

function inspectWorkbook(filename: string) {
  const script = `import json,sys
from openpyxl import load_workbook
w=load_workbook(sys.argv[1], data_only=False)
print(json.dumps({"names":w.sheetnames,"sheets":{s.title:{"rows":list(s.values),"freeze":s.freeze_panes,"filter":s.auto_filter.ref,"formulas":[c.coordinate for row in s for c in row if c.data_type=="f"]} for s in w}},ensure_ascii=True))`;
  return JSON.parse(execFileSync(process.env.PYTHON_BIN || 'python', ['-c', script, filename], { encoding: 'utf8', windowsHide: true }));
}

describe('persistent XLSX export', () => {
  it('creates six accurate safe sheets and preserves uncovered rows under approved-only filtering', async () => {
    const actor = { createdBy: DEMO_USER_ID, updatedBy: DEMO_USER_ID };
    const project = await db.project.create({ data: { workspaceId: DEMO_WORKSPACE_ID, name: `認証 Équipe ${randomUUID()}`, ...actor } });
    const source = await db.sourceDocument.create({ data: { projectId: project.id, filename: '要件.txt', mime: 'text/plain', sha256: 'test-only', storageKey: `${randomUUID()}.txt`, size: 12, status: 'succeeded', text: 'Source evidence', ...actor } });
    await writeFile(storagePath(source.storageKey), 'Source evidence');
    const requirement = await db.requirement.create({ data: { projectId: project.id, sourceId: source.id, stableCode: 'REQ-001', text: '\t =HYPERLINK("https://invalid.example")', excerpt: 'Source evidence', sourceLocator: { paragraph: 1 }, confidence: 'high', ...actor } });
    const uncovered = await db.requirement.create({ data: { projectId: project.id, sourceId: source.id, stableCode: 'REQ-002', text: 'Password reset must expire', excerpt: 'Source evidence', sourceLocator: { paragraph: 2 }, confidence: 'high', ...actor } });
    const scenario = await db.scenario.create({ data: { projectId: project.id, stableCode: 'SCN-001', title: 'Account review', ...actor } });
    const approved = await db.testCase.create({ data: {
      projectId: project.id, scenarioId: scenario.id, stableCode: 'TC-001', title: '+edited approved title', status: 'approved', stale: true, reviewerNotes: 'x'.repeat(40_000), ...actor,
      steps: { create: { position: 1, action: 'Enter corrected account data', expectedResult: 'Corrected expectation persists' } },
      links: { create: { requirementId: requirement.id, createdBy: DEMO_USER_ID } },
    } });
    await db.sourceCitation.create({ data: { entityType: 'test_case', entityId: approved.id, sourceId: source.id, locator: { paragraph: 1 }, quote: 'Source evidence', inferred: false } });
    await db.testCase.create({ data: {
      projectId: project.id, scenarioId: scenario.id, stableCode: 'TC-002', title: 'Draft reset case', ...actor,
      steps: { create: { position: 1, action: 'Request reset', expectedResult: 'Expiry follows the requirement' } },
      links: { create: { requirementId: uncovered.id, createdBy: DEMO_USER_ID } },
    } });
    await db.testCase.create({ data: { projectId: project.id, scenarioId: scenario.id, stableCode: 'TC-003', title: 'Rejected candidate', status: 'rejected', ...actor } });

    const makeExport = async (approvedOnly: boolean) => {
      const record = await db.export.create({ data: { projectId: project.id, approvedOnly, idempotencyKey: randomUUID(), createdBy: DEMO_USER_ID } });
      const job = await db.job.create({ data: { projectId: project.id, kind: 'build_export', entityId: record.id, status: 'failed', payload: {}, createdBy: DEMO_USER_ID } });
      await buildExport(job.id);
      return db.export.findUniqueOrThrow({ where: { id: record.id } });
    };
    const all = await makeExport(false);
    const allWorkbook = inspectWorkbook(storagePath(all.storageKey!));
    expect(allWorkbook.sheets['Test Cases'].rows).toHaveLength(4);
    expect(allWorkbook.sheets['Test Cases'].rows.some((row: unknown[]) => row[11] === 'rejected')).toBe(true);
    const selected = await makeExport(true);
    expect(selected.status).toBe('succeeded');
    expect(selected.filename).toContain('認証-Équipe');
    const workbook = inspectWorkbook(storagePath(selected.storageKey!));
    expect(workbook.names).toEqual(['Summary', 'Requirements', 'Scenarios', 'Test Cases', 'RTM', 'Warnings']);
    const payload = await createExportPayload(project.id, true);
    expect(workbook.sheets['Test Cases'].rows.length - 1).toBe(payload.counts.cases);
    expect(workbook.sheets.Requirements.rows.length - 1).toBe(payload.counts.requirements);
    expect(workbook.sheets.Requirements.rows[1][2]).toMatch(/^'/);
    expect(workbook.sheets['Test Cases'].rows[1][2]).toBe("'+edited approved title");
    expect(workbook.sheets['Test Cases'].rows[1][8]).toContain('Corrected expectation persists');
    expect(workbook.sheets['Test Cases'].rows[1][13]).toContain('Source evidence');
    expect(workbook.sheets.RTM.rows.some((row: unknown[]) => row[0] === 'REQ-002' && !row[3] && row[5] === 'uncovered')).toBe(true);
    expect(workbook.sheets.Warnings.rows.some((row: unknown[]) => String(row[2]).includes('truncated'))).toBe(true);
    expect(workbook.sheets.Warnings.rows.some((row: unknown[]) => String(row[2]).includes('stale'))).toBe(true);
    for (const sheet of Object.values(workbook.sheets) as { freeze: string; formulas: string[] }[]) {
      expect(sheet.freeze).toBe('A2');
      expect(sheet.formulas).toEqual([]);
    }
    await db.export.update({ where: { id: selected.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await cleanupExpiredExports();
    await expect(access(storagePath(selected.storageKey!))).rejects.toThrow();
    await expect(access(storagePath(source.storageKey))).resolves.toBeUndefined();
    expect((await db.export.findUniqueOrThrow({ where: { id: selected.id } })).status).toBe('expired');
  }, 60_000);
});
