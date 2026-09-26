import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { db, DEMO_USER_ID, DEMO_WORKSPACE_ID } from '../packages/db';
import { buildTraceability } from '../apps/web/lib/traceability';

afterAll(async () => { await db.$disconnect(); });

describe('persistent traceability selection', () => {
  it('tracks approved, draft, stale, rejected, orphan and out-of-scope cases accurately', async () => {
    const actor = { createdBy: DEMO_USER_ID, updatedBy: DEMO_USER_ID };
    const project = await db.project.create({ data: { workspaceId: DEMO_WORKSPACE_ID, name: `Traceability ${randomUUID()}`, ...actor } });
    const requirements = await Promise.all(['Approved', 'Draft', 'Stale', 'Rejected', 'Out of scope'].map((text, index) => db.requirement.create({ data: {
      projectId: project.id, stableCode: `REQ-${index + 1}`, text: `${text} requirement`, included: index !== 4,
      confidence: index === 1 ? 'review' : 'high', outOfScopeReason: index === 4 ? 'Deferred by owner' : null, ...actor,
    } })));
    const states = [
      { status: 'approved', stale: false }, { status: 'draft', stale: false },
      { status: 'approved', stale: true }, { status: 'rejected', stale: false },
    ];
    for (const [index, state] of states.entries()) await db.testCase.create({ data: {
      projectId: project.id, stableCode: `TC-${index + 1}`, title: `${state.status} case ${index}`, ...state, ...actor,
      steps: { create: { position: 1, action: 'Exercise the requirement', expectedResult: 'The required behavior is observed' } },
      links: { create: { requirementId: requirements[index].id, createdBy: DEMO_USER_ID } },
    } });
    await db.testCase.create({ data: { projectId: project.id, stableCode: 'TC-orphan', title: 'Manual orphan', manual: true, ...actor } });
    const all = await buildTraceability(project.id);
    expect(all.rows.map(row => row.coverage)).toEqual(['covered', 'needs review', 'needs review', 'uncovered', 'uncovered']);
    expect(all.counts).toMatchObject({ requirements: 5, cases: 4, approved: 2, draft: 2, stale: 1, uncovered: 1, rejected: 1 });
    expect(all.orphans.map(testCase => testCase.stableCode)).toEqual(['TC-orphan']);
    expect(all.ambiguous.map(row => row.requirement.id)).toEqual([requirements[1].id]);
    expect(all.uncovered.map(row => row.requirement.id)).not.toContain(requirements[4].id);
    const approved = await buildTraceability(project.id, true);
    expect(approved.counts).toMatchObject({ cases: 2, approved: 2, draft: 0, stale: 1, uncovered: 2 });
    expect(approved.rows[1].cases).toEqual([]);
    expect(approved.rows[1].coverage).toBe('uncovered');
    expect(approved.warnings.some(warning => warning.entityId === requirements[1].stableCode && warning.issue.includes('approved-only'))).toBe(true);
    expect(approved.warnings.some(warning => warning.issue.includes('stale'))).toBe(true);
  });
});
