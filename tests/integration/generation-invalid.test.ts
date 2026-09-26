import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { db, DEMO_USER_ID } from '../../packages/db';
import { generateCases } from '../../services/worker/generation';
import { api, createProject, jsonRequest, requirements, waitForJob } from '../helpers';

afterAll(async () => { await db.$disconnect(); });

describe('external model failure safety', () => {
  it('records invalid JSON failure and preserves all project data', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: 'not valid JSON' } }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Mock server failed to start');
    const previous = { base: process.env.MODEL_BASE_URL, model: process.env.MODEL_NAME, key: process.env.MODEL_API_KEY };
    process.env.MODEL_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
    process.env.MODEL_NAME = 'invalid-fixture';
    process.env.MODEL_API_KEY = '';
    try {
      const projectId = await createProject('Malformed provider');
      const source = await api(`/projects/${projectId}/sources`, jsonRequest('POST', { text: '1. A valid user must sign in successfully.' }));
      await waitForJob((await source.json()).job_id);
      const items = await requirements(projectId);
      const confirmation = await api(`/projects/${projectId}/requirements/confirm`, jsonRequest('POST', { requirements: items.map(item => ({ id: item.id, revision: item.revision })) }));
      expect(confirmation.status).toBe(200);
      const hash = (await confirmation.json()).snapshot_hash;
      const snapshot = await db.requirementSnapshot.findUniqueOrThrow({ where: { projectId_hash: { projectId, hash } } });
      const run = await db.generationRun.create({ data: {
        projectId, snapshotId: snapshot.id, snapshotHash: hash, idempotencyKey: randomUUID(), modelId: 'invalid-fixture',
        promptVersion: 'testpilot-v1', provider: 'external', types: ['positive'], createdBy: DEMO_USER_ID,
      } });
      // No outbox: invoke the real handler directly against a private local mock.
      const job = await db.job.create({ data: { projectId, entityId: run.id, kind: 'generate_cases', payload: {}, createdBy: DEMO_USER_ID, status: 'failed' } });
      await expect(generateCases(job.id)).rejects.toThrow('invalid JSON');
      expect((await db.generationRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('failed');
      expect(await db.testCase.count({ where: { projectId } })).toBe(0);
      expect(await db.scenario.count({ where: { projectId } })).toBe(0);
      expect(await db.requirement.count({ where: { projectId } })).toBe(items.length);
      const visible = await (await api(`/projects/${projectId}/generations`)).json();
      expect(visible.runs.find((item: { id: string }) => item.id === run.id).error).toContain('invalid JSON');
      await db.job.update({ where: { id: job.id }, data: { status: 'failed', error: 'Invalid JSON test completed', completedAt: new Date() } });
    } finally {
      if (previous.base === undefined) delete process.env.MODEL_BASE_URL; else process.env.MODEL_BASE_URL = previous.base;
      if (previous.model === undefined) delete process.env.MODEL_NAME; else process.env.MODEL_NAME = previous.model;
      if (previous.key === undefined) delete process.env.MODEL_API_KEY; else process.env.MODEL_API_KEY = previous.key;
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 90_000);
});

