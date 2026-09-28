import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { appUrl, authCookies, oidcConfig, safeReturnTo, sessionCookie } from '../../../../lib/auth';

function failed(reason: string) { return NextResponse.redirect(new URL(`/access-denied?reason=${encodeURIComponent(reason)}`, appUrl())); }

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('error')) return failed('provider');
  const code = request.nextUrl.searchParams.get('code'), state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(authCookies.state)?.value;
  const verifier = request.cookies.get(authCookies.verifier)?.value, nonce = request.cookies.get(authCookies.nonce)?.value;
  if (!code || !state || !expectedState || state !== expectedState || !verifier || !nonce) return failed('invalid-state');
  try {
    const config = oidcConfig();
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${appUrl()}/api/auth/callback`, client_id: config.clientId, code_verifier: verifier });
    if (config.clientSecret) body.set('client_secret', config.clientSecret);
    const tokenResponse = await fetch(config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, cache: 'no-store' });
    if (!tokenResponse.ok) throw new Error(`Token exchange failed with status ${tokenResponse.status}`);
    const tokens = await tokenResponse.json() as { access_token?: string; id_token?: string; expires_in?: number };
    if (!tokens.access_token || !tokens.id_token) throw new Error('Provider did not return required tokens');
    const identity=await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(config.jwksUrl)), { issuer: config.issuer, audience: config.clientId });
    if (identity.payload.nonce !== nonce) throw new Error('Identity nonce did not match the login request');
    const response = NextResponse.redirect(new URL(safeReturnTo(request.cookies.get(authCookies.returnTo)?.value), appUrl()));
    response.cookies.set(authCookies.session, tokens.access_token, sessionCookie(tokens.expires_in));
    response.cookies.set(authCookies.idToken, tokens.id_token, { ...sessionCookie(tokens.expires_in), path: '/api/auth/logout' });
    for (const name of [authCookies.state, authCookies.verifier, authCookies.nonce, authCookies.returnTo]) response.cookies.set(name, '', { path: '/api/auth', maxAge: 0 });
    return response;
  } catch (error) {
    console.error('OIDC callback failed', error);
    return failed('authentication');
  }
}
