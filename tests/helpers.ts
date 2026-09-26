import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const baseUrl = process.env.APP_URL || 'http://localhost:3000';
export function api(path: string, options?: RequestInit) {
  return fetch(`${baseUrl}/api/v1${path}`, options);
}
export function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
export async function createProject(label: string): Promise<string> {
  const response = await api('/projects', jsonRequest('POST', { name: `${label} ${randomUUID()}`, domain: 'Account security' }));
  if (response.status !== 201) throw new Error(`Project creation failed (${response.status}): ${await response.text()}`);
  return (await response.json()).id;
}
export async function uploadFixture(projectId: string, filename: string, mime: string) {
  const data = await readFile(resolve('fixtures', filename));
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(data)], { type: mime }), filename);
  return api(`/projects/${projectId}/sources`, { method: 'POST', body: form });
}
export async function waitForJob(id: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await api(`/jobs/${id}`);
    if (!response.ok) throw new Error(`Job lookup failed (${response.status}): ${await response.text()}`);
    const job = await response.json();
    if (job.status === 'failed') throw new Error(`Job failed: ${JSON.stringify(job.error)}`);
    if (job.status === 'succeeded') return job;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Job ${id} did not finish within ${timeoutMs} ms`);
}

export interface Requirement {
  id: string; stableCode: string; text: string; sourceId: string;
  sourceLocator: { page?: number; paragraph?: number }; excerpt: string;
  version: number; revision: number; included: boolean;
}
export async function requirements(projectId: string): Promise<Requirement[]> {
  const response = await api(`/projects/${projectId}/requirements?limit=100`);
  if (!response.ok) throw new Error(`Requirements lookup failed: ${await response.text()}`);
  return (await response.json()).requirements;
}
