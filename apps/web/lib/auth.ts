import { createHash, randomBytes } from 'node:crypto';

export const authCookies = {
  session: 'tp_session',
  idToken: 'tp_id_token',
  state: 'tp_oidc_state',
  verifier: 'tp_oidc_verifier',
  nonce: 'tp_oidc_nonce',
  returnTo: 'tp_oidc_return_to',
} as const;

export function demoAuthEnabled() {
  return process.env.DEMO_AUTH === 'true' && process.env.APP_ENV !== 'production';
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/api/') || value.startsWith('/sign-in')) return '/projects';
  return value;
}

export function randomUrlSafe(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function codeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function oidcConfig() {
  const required = {
    issuer: process.env.OIDC_ISSUER,
    audience: process.env.OIDC_AUDIENCE,
    jwksUrl: process.env.OIDC_JWKS_URL,
    clientId: process.env.OIDC_CLIENT_ID,
    authorizationUrl: process.env.OIDC_AUTHORIZATION_URL,
    tokenUrl: process.env.OIDC_TOKEN_URL,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`OIDC is missing required configuration: ${missing.join(', ')}`);
  return {
    issuer: required.issuer!, audience: required.audience!, jwksUrl: required.jwksUrl!, clientId: required.clientId!,
    clientSecret: process.env.OIDC_CLIENT_SECRET || '', authorizationUrl: required.authorizationUrl!, tokenUrl: required.tokenUrl!,
    endSessionUrl: process.env.OIDC_END_SESSION_URL || '', passwordResetUrl: process.env.OIDC_PASSWORD_RESET_URL || '',
    scopes: process.env.OIDC_SCOPES || 'openid profile email',
  };
}

export const temporaryCookie = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.APP_ENV === 'production', path: '/api/auth', maxAge: 600 };
export const sessionCookie = (maxAge = 28800) => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.APP_ENV === 'production', path: '/', maxAge: Math.min(Math.max(maxAge, 60), 28800) });
