import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { api, createProject, jsonRequest, requirements, waitForJob } from '../helpers';

async function preparedProject() {
  const projectId = await createProject('Review workflow');
  const submission = await api(`/projects/${projectId}/sources`, jsonRequest('POST', { text: '1. Valid credentials must allow sign in.\n2. Invalid credentials must show a generic error.' }));
  expect(submission.status).toBe(202);
  await waitForJob((await submission.json()).job_id);
  const items = await requirements(projectId);
  const confirm = await api(`/projects/${projectId}/requirements/confirm`, jsonRequest('POST', { requirements: items.map(item => ({ id: item.id, revision: item.revision })) }));
  expect(confirm.status).toBe(200);
  const generation = await api(`/projects/${projectId}/generations`, jsonRequest('POST', { snapshot_hash: (await confirm.json()).snapshot_hash, types: ['positive'], idempotency_key: randomUUID() }));
  expect(generation.status).toBe(202);
  await waitForJob((await generation.json()).job_id);
  return { projectId, items: await requirements(projectId), cases: (await (await api(`/projects/${projectId}/test-cases`)).json()).cases };
}

describe('Milestone 3: human review and traceability', () => {
  it('preserves edits and history, rejects stale updates, approves, and propagates requirement staleness', async () => {
    const { projectId, items, cases } = await preparedProject();
    const original = cases[0];
    const editBody = { title: 'Human-corrected login case', preconditions: 'An active account exists.', testData: 'A valid test account', postconditions: 'Session created', priority: 'high', type: 'positive', rationale: 'Reviewer correction', steps: [{ action: 'Submit valid credentials', expectedResult: 'Account dashboard opens' }], version: original.version };
    const edit = await api(`/test-cases/${original.id}`, jsonRequest('PATCH', editBody));
    expect(edit.status).toBe(200);
    const edited = await edit.json();
    expect(edited.version).toBe(original.version + 1);
    expect((await api(`/test-cases/${original.id}`, jsonRequest('PATCH', editBody))).status).toBe(409);
    const approve = await api(`/test-cases/${original.id}/review`, jsonRequest('POST', { action: 'approve', note: 'Verified against the requirement.', version: edited.version }));
    expect(approve.status).toBe(200);
    const savedCases = (await (await api(`/projects/${projectId}/test-cases`)).json()).cases;
    const approved = savedCases.find((item: { id: string }) => item.id === original.id);
    expect(approved).toMatchObject({ title: editBody.title, status: 'approved', preconditions: editBody.preconditions });
    expect(approved.steps[0]).toMatchObject(editBody.steps[0]);
    const history = await (await api(`/test-cases/${original.id}/history`)).json();
    expect(history.versions.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(history)).toContain(original.title);
    expect(JSON.stringify(history)).toContain(editBody.title);

    const linkedId = approved.links[0].requirementId;
    const linked = items.find(item => item.id === linkedId)!;
    const revise = await api(`/requirements/${linkedId}`, jsonRequest('PATCH', { text: `${linked.text} The account must be active.`, version: linked.version }));
    expect(revise.status).toBe(200);
    const stale = (await (await api(`/projects/${projectId}/test-cases`)).json()).cases.find((item: { id: string }) => item.id === original.id);
    expect(stale.stale).toBe(true);
    expect(stale.version).toBeGreaterThan(approved.version);
    const retain = await api(`/test-cases/${original.id}/review`, jsonRequest('POST', { action: 'retain', note: 'Still valid after source revision.', version: stale.version }));
    expect(retain.status).toBe(200);
    expect((await (await api(`/projects/${projectId}/test-cases`)).json()).cases.find((item: { id: string }) => item.id === original.id).stale).toBe(false);
  }, 90_000);

  it('tracks orphan and uncovered queues while linking manual cases and validates expected results', async () => {
    const { projectId, items, cases } = await preparedProject();
    for (const testCase of cases) {
      expect((await api(`/test-cases/${testCase.id}/links`, jsonRequest('POST', { requirementIds: [], version: testCase.version }))).status).toBe(200);
    }
    const uncovered = await (await api(`/projects/${projectId}/traceability`)).json();
    expect(uncovered.uncovered.length).toBe(items.length);
    expect(uncovered.orphans.length).toBe(cases.length);
    const manual = await api(`/projects/${projectId}/test-cases`, jsonRequest('POST', { title: 'Manual permission check', steps: [{ action: 'Attempt sign in', expectedResult: 'Access denied' }], requirementIds: [items[0].id] }));
    expect(manual.status).toBe(201);
    const created = await manual.json();
    const linked = await (await api(`/projects/${projectId}/traceability`)).json();
    expect(linked.uncovered.length).toBe(items.length - 1);
    expect(JSON.stringify(linked.rows)).toContain(created.id);
    const invalid = await api(`/test-cases/${created.id}`, jsonRequest('PATCH', { steps: [{ action: 'Attempt sign in', expectedResult: '' }], version: created.version }));
    expect(invalid.status).toBe(200);
    const incomplete = await invalid.json();
    const blockedApproval = await api(`/test-cases/${created.id}/review`, jsonRequest('POST', { action: 'approve', note: 'Incomplete expected result', version: incomplete.version }));
    expect(blockedApproval.status).toBe(422);
    const corrected = await api(`/test-cases/${created.id}`, jsonRequest('PATCH', { steps: [{ action: 'Attempt sign in', expectedResult: 'Access denied' }], version: incomplete.version }));
    expect(corrected.status).toBe(200);
    const valid = await api(`/test-cases/${created.id}/review`, jsonRequest('POST', { action: 'approve', note: 'Manually reviewed', version: (await corrected.json()).version }));
    expect(valid.status).toBe(200);
  }, 90_000);

  it('regenerates as a retained version and bulk approves only selected drafts', async () => {
    const { projectId, cases } = await preparedProject();
    const first = cases[0];
    const regenerate = await api(`/test-cases/${first.id}/regenerate`, jsonRequest('POST', { version: first.version }));
    expect(regenerate.status).toBe(202);
    await waitForJob((await regenerate.json()).job_id);
    const current = (await (await api(`/projects/${projectId}/test-cases`)).json()).cases;
    const updated = current.find((item: { id: string }) => item.id === first.id);
    expect(updated.version).toBeGreaterThan(first.version);
    expect(updated.status).toBe('draft');
    expect((await (await api(`/test-cases/${first.id}/history`)).json()).versions.length).toBeGreaterThanOrEqual(2);
    const bulk = await api(`/projects/${projectId}/test-cases/bulk-review`, jsonRequest('POST', { cases: [{ id: updated.id, version: updated.version }], action: 'approve', note: 'Selected draft reviewed' }));
    expect(bulk.status).toBe(200);
    const final = (await (await api(`/projects/${projectId}/test-cases`)).json()).cases;
    expect(final.find((item: { id: string }) => item.id === first.id).status).toBe('approved');
    expect(final.filter((item: { id: string }) => item.id !== first.id).every((item: { status: string }) => item.status === 'draft')).toBe(true);
  }, 90_000);
});
