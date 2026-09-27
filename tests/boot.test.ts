import { describe, expect, it } from 'vitest';

const baseUrl = process.env.APP_URL || 'http://localhost:3000';
const seedId = '00000000-0000-4000-8000-000000000003';

describe('Milestone 0: local boot', () => {
  it('reports PostgreSQL and Redis ready', async () => {
    const response = await fetch(`${baseUrl}/health/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ready', database: 'ok', redis: 'ok' });
  });

  it('returns the persistent seeded project through the authenticated demo API', async () => {
    const response = await fetch(`${baseUrl}/api/v1/projects?search=${encodeURIComponent('Login & Password Reset')}&limit=100`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projects).toEqual(expect.any(Array));
    expect(body.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: seedId, name: 'Login & Password Reset' }),
    ]));
    const detail = await fetch(`${baseUrl}/api/v1/projects/${seedId}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ id: seedId, _count: {
      sources: expect.any(Number), requirements: expect.any(Number), testCases: expect.any(Number),
    } });
  });

  it('serves the project dashboard', async () => {
    const response = await fetch(`${baseUrl}/projects`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Projects');
  });
});
