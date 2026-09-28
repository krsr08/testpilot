import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { codeChallenge, demoAuthEnabled, safeReturnTo } from '../apps/web/lib/auth';
import { GET as login } from '../apps/web/app/api/auth/login/route';
import { GET as callback } from '../apps/web/app/api/auth/callback/route';
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });
describe('browser authentication', () => {
  it('accepts only local return paths', () => { expect(safeReturnTo('/projects/abc?tab=rtm')).toBe('/projects/abc?tab=rtm'); expect(safeReturnTo('//attacker.example')).toBe('/projects'); expect(safeReturnTo('https://attacker.example')).toBe('/projects'); expect(safeReturnTo('/api/auth/logout')).toBe('/projects'); });
  it('creates the RFC 7636 S256 challenge', () => { expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'); });
  it('keeps demo authentication disabled in production', () => { process.env.DEMO_AUTH='true'; process.env.APP_ENV='production'; expect(demoAuthEnabled()).toBe(false); });
  it('returns directly to a safe page in demo mode', async () => { process.env.DEMO_AUTH='true'; process.env.APP_ENV='development'; process.env.APP_URL='http://localhost:3000'; const response=await login(new NextRequest('http://localhost:3000/api/auth/login?returnTo=%2Fworkspace')); expect(response.headers.get('location')).toBe('http://localhost:3000/workspace'); });
  it('rejects callbacks with missing anti-forgery state', async () => { process.env.APP_URL='http://localhost:3000'; const response=await callback(new NextRequest('http://localhost:3000/api/auth/callback?code=secret&state=wrong')); expect(response.headers.get('location')).toBe('http://localhost:3000/access-denied?reason=invalid-state'); });
});
