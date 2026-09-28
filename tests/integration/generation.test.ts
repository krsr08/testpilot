import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { db } from '../../packages/db';
import { api, createProject, jsonRequest, requirements, waitForJob } from '../helpers';

async function reviewedProject() {
  const projectId = await createProject('Generation contract');
  const source = await api(`/projects/${projectId}/sources`, jsonRequest('POST', {
    text: '1. Users must sign in with a valid email address and password.\n2. Invalid passwords must return a generic authentication error.',
  }));
  expect(source.status).toBe(202);
  await waitForJob((await source.json()).job_id);
  const items = await requirements(projectId);
  const confirmation = await api(`/projects/${projectId}/requirements/confirm`, jsonRequest('POST', { requirements: items.map(item => ({ id: item.id, revision: item.revision })) }));
  expect(confirmation.status).toBe(200);
  const { snapshot_hash: hash } = await confirmation.json();
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  return { projectId, items: await requirements(projectId), hash };
}

describe('Milestone 2: immutable source-grounded generation', () => {
  it('persists draft cases with valid steps, links, citations, and idempotent retries', async () => {
    const { projectId, items, hash } = await reviewedProject();
    const request = { snapshot_hash: hash, types: ['positive', 'negative'], idempotency_key: randomUUID() };
    const response = await api(`/projects/${projectId}/generations`, jsonRequest('POST', request));
    expect(response.status).toBe(202);
    const created = await response.json();
    expect(created.run.id).toEqual(expect.any(String));
    await waitForJob(created.job_id);
    const list = await api(`/projects/${projectId}/test-cases?limit=100`);
    expect(list.status).toBe(200);
    const { cases } = await list.json();
    expect(cases.length).toBeGreaterThanOrEqual(items.length);
    expect(cases.every((item:{agentGovernance?:{generator?:{status:string};grounding?:{status:string};critic?:{status:string}}})=>item.agentGovernance?.generator?.status==='SUCCEEDED'&&['SUCCEEDED','NEEDS_HUMAN'].includes(item.agentGovernance?.grounding?.status||'')&&item.agentGovernance?.critic?.status==='SUCCEEDED')).toBe(true);
    const knownIds = new Set(items.map(item => item.id));
    const knownSourceIds = new Set(items.map(item => item.sourceId));
    for (const testCase of cases) {
      expect(testCase.status).toBe('draft');
      expect(['positive', 'negative']).toContain(testCase.type);
      expect(testCase.steps.length).toBeGreaterThan(0);
      for (const step of testCase.steps) {
        expect(step.action.trim().length).toBeGreaterThan(0);
        expect(step.expectedResult.trim().length).toBeGreaterThan(0);
      }
      expect(testCase.scenario.id).toEqual(expect.any(String));
      expect(testCase.links.length).toBeGreaterThan(0);
      for (const link of testCase.links) expect(knownIds.has(link.requirementId)).toBe(true);
      expect(testCase.citations.length).toBeGreaterThan(0);
      for (const citation of testCase.citations) {
        if (!citation.inferred) {
          expect(knownSourceIds.has(citation.sourceId)).toBe(true);
          expect(items.some(item => item.excerpt.includes(citation.quote) && citation.quote.length > 0)).toBe(true);
          expect(citation.locator.paragraph).toBeGreaterThan(0);
        } else {
          expect(citation.quote).toBe('');
          expect(citation.locator).toEqual({});
        }
      }
    }
    const retry = await api(`/projects/${projectId}/generations`, jsonRequest('POST', request));
    expect(retry.status).toBe(202);
    expect((await retry.json()).run.id).toBe(created.run.id);
    const after = await (await api(`/projects/${projectId}/test-cases?limit=100`)).json();
    expect(after.cases.map((item: { id: string }) => item.id).sort()).toEqual(cases.map((item: { id: string }) => item.id).sort());
  }, 90_000);

  it('retains immutable snapshots after edits and rejects confirmation of stale revisions', async () => {
    const { projectId, items, hash } = await reviewedProject();
    const before = await (await api(`/projects/${projectId}/generations`)).json();
    const originalSnapshot = before.snapshots.find((snapshot: { hash: string }) => snapshot.hash === hash);
    expect(originalSnapshot).toBeDefined();
    const storedSnapshot = await db.requirementSnapshot.findUniqueOrThrow({ where: { projectId_hash: { projectId, hash } } });
    await expect(db.requirementSnapshot.update({ where: { id: storedSnapshot.id }, data: { items: [] } })).rejects.toThrow();
    const first = items[0];
    const edit = await api(`/requirements/${first.id}`, jsonRequest('PATCH', { text: `${first.text} Accounts must be active.`, version: first.version }));
    expect(edit.status).toBe(200);
    const stale = await api(`/projects/${projectId}/requirements/confirm`, jsonRequest('POST', { requirements: items.map(item => ({ id: item.id, revision: item.revision })) }));
    expect(stale.status).toBe(409);
    const current = await requirements(projectId);
    const confirm = await api(`/projects/${projectId}/requirements/confirm`, jsonRequest('POST', { requirements: current.map(item => ({ id: item.id, revision: item.revision })) }));
    expect(confirm.status).toBe(200);
    expect((await confirm.json()).snapshot_hash).not.toBe(hash);
    const after = await (await api(`/projects/${projectId}/generations`)).json();
    expect(after.snapshots.find((snapshot: { hash: string }) => snapshot.hash === hash)).toEqual(originalSnapshot);
    expect(await db.requirementSnapshot.findUniqueOrThrow({ where: { id: storedSnapshot.id } })).toEqual(storedSnapshot);
  }, 90_000);

  it('rejects generation without a confirmed project snapshot', async () => {
    const projectId = await createProject('No snapshot');
    const response = await api(`/projects/${projectId}/generations`, jsonRequest('POST', { snapshot_hash: '0'.repeat(64), types: ['positive'], idempotency_key: randomUUID() }));
    expect(response.status).toBe(422);
    const data = await (await api(`/projects/${projectId}/generations`)).json();
    expect(data.runs).toHaveLength(0);
    expect((await (await api(`/projects/${projectId}/test-cases`)).json()).cases).toHaveLength(0);
  });
});
