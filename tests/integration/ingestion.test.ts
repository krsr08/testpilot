import { describe, expect, it } from 'vitest';
import { api, createProject, jsonRequest, requirements, uploadFixture, waitForJob } from '../helpers';

describe('Milestone 1: persistent source-grounded ingestion', () => {
  it.each([
    ['sample-login.pdf', 'application/pdf'],
    ['sample-login.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['sample-login.txt', 'text/plain'],
  ])('extracts reviewable requirements from %s with stable references', async (filename, mime) => {
    const projectId = await createProject(`Ingest ${filename}`);
    const response = await uploadFixture(projectId, filename, mime);
    expect(response.status).toBe(202);
    const submission = await response.json();
    expect(submission.source.id).toEqual(expect.any(String));
    expect(submission.job_id).toEqual(expect.any(String));
    await waitForJob(submission.job_id);
    const items = await requirements(projectId);
    expect(items.length).toBeGreaterThan(2);
    expect(new Set(items.map(item => item.stableCode)).size).toBe(items.length);
    for (const item of items) {
      expect(item.stableCode).toMatch(/^REQ-\d+$/);
      expect(item.sourceId).toBe(submission.source.id);
      expect(item.excerpt.trim().length).toBeGreaterThan(0);
      expect(item.sourceLocator.paragraph).toBeGreaterThan(0);
      if (filename.endsWith('.pdf')) expect(item.sourceLocator.page).toBeGreaterThan(0);
    }
    expect((await requirements(projectId)).map(item => item.stableCode)).toEqual(items.map(item => item.stableCode));

    const original = items[0];
    const revisedText = `${original.text} Reviewed by a human.`;
    const edit = await api(`/requirements/${original.id}`, jsonRequest('PATCH', { text: revisedText, included: false, version: original.version }));
    expect(edit.status).toBe(200);
    const saved = (await requirements(projectId)).find(item => item.id === original.id)!;
    expect(saved).toMatchObject({ text: revisedText, included: false, stableCode: original.stableCode, excerpt: original.excerpt, sourceLocator: original.sourceLocator, revision: original.revision + 1, version: original.version + 1 });
    const conflict = await api(`/requirements/${original.id}`, jsonRequest('PATCH', { text: 'Stale tab update', version: original.version }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect((await requirements(projectId)).find(item => item.id === original.id)?.text).toBe(revisedText);
  }, 90_000);

  it('rejects unsupported and oversized files without creating partial sources', async () => {
    const projectId = await createProject('Invalid sources');
    for (const [name, content, type] of [
      ['payload.exe', new Uint8Array([77, 90]), 'application/octet-stream'],
      ['large.txt', new Uint8Array(11 * 1024 * 1024), 'text/plain'],
    ] as const) {
      const form = new FormData();
      form.set('file', new Blob([content], { type }), name);
      const response = await api(`/projects/${projectId}/sources`, { method: 'POST', body: form });
      expect(response.status).toBe(422);
      const error = await response.json();
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.request_id).toEqual(expect.any(String));
    }
    const project = await (await api(`/projects/${projectId}`)).json();
    expect(project.sources).toHaveLength(0);
  });

  it('reports OCR unsupported for scanned PDFs without fabricated requirements', async () => {
    const projectId = await createProject('Scanned PDF');
    const response = await uploadFixture(projectId, 'scanned.pdf', 'application/pdf');
    expect(response.status).toBe(202);
    await waitForJob((await response.json()).job_id);
    expect(await requirements(projectId)).toHaveLength(0);
    const project = await (await api(`/projects/${projectId}`)).json();
    expect(JSON.stringify(project.sources[0].warnings)).toMatch(/OCR|scanned/i);
  }, 90_000);

  it('segments pasted numbered acceptance criteria and preserves their source excerpts', async () => {
    const projectId = await createProject('Pasted story');
    const text = '1. Users must sign in using a valid email and password.\n2. Invalid passwords must show a generic error.\n3. Reset links must expire after 30 minutes.';
    const response = await api(`/projects/${projectId}/sources`, jsonRequest('POST', { text }));
    expect(response.status).toBe(202);
    await waitForJob((await response.json()).job_id);
    const items = await requirements(projectId);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(text).toContain(item.excerpt);
      expect(item.sourceLocator.paragraph).toBeGreaterThan(0);
    }
  }, 90_000);

  it('splits and merges reviewed requirements while retaining original source evidence', async () => {
    const projectId = await createProject('Split merge');
    const response = await api(`/projects/${projectId}/sources`, jsonRequest('POST', { text: '1. Users must enter an email and a password to sign in.' }));
    expect(response.status).toBe(202);
    await waitForJob((await response.json()).job_id);
    const [original] = await requirements(projectId);
    const split = await api(`/requirements/${original.id}/split`, jsonRequest('POST', { version: original.version, texts: ['Users must enter an email.', 'Users must enter a password.'] }));
    expect(split.status).toBe(201);
    const parts = (await split.json()).requirements;
    expect(parts).toHaveLength(2);
    for (const part of parts) expect(part).toMatchObject({ excerpt: original.excerpt, sourceId: original.sourceId, sourceLocator: original.sourceLocator, included: true });
    expect((await requirements(projectId)).find(item => item.id === original.id)?.included).toBe(false);
    const merge = await api(`/projects/${projectId}/requirements/merge`, jsonRequest('POST', { requirements: parts.map((part: { id: string; version: number }) => ({ id: part.id, version: part.version })) }));
    expect(merge.status).toBe(201);
    const merged = await merge.json();
    expect(merged.text).toContain('Users must enter an email.');
    expect(merged.text).toContain('Users must enter a password.');
    expect(merged.sourceLocator.parts).toHaveLength(2);
    const final = await requirements(projectId);
    expect(final.filter(item => item.included).map(item => item.id)).toEqual([merged.id]);
    expect(new Set(final.map(item => item.stableCode)).size).toBe(final.length);
  }, 90_000);
});
