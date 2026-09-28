import { NextRequest, NextResponse } from 'next/server';
import { appUrl, authCookies, codeChallenge, demoAuthEnabled, oidcConfig, randomUrlSafe, safeReturnTo, temporaryCookie } from '../../../../lib/auth';

export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  if (demoAuthEnabled()) return NextResponse.redirect(new URL(returnTo, appUrl()));
  try {
    const config = oidcConfig(), state = randomUrlSafe(), verifier = randomUrlSafe(48), nonce = randomUrlSafe();
    const redirectUri = `${appUrl()}/api/auth/callback`;
    const target = new URL(config.authorizationUrl);
    target.searchParams.set('response_type', 'code'); target.searchParams.set('client_id', config.clientId);
    target.searchParams.set('redirect_uri', redirectUri); target.searchParams.set('scope', config.scopes);
    target.searchParams.set('state', state); target.searchParams.set('nonce', nonce);
    target.searchParams.set('code_challenge', codeChallenge(verifier)); target.searchParams.set('code_challenge_method', 'S256');
    if (config.audience) target.searchParams.set('audience', config.audience);
    const response = NextResponse.redirect(target);
    response.cookies.set(authCookies.state, state, temporaryCookie); response.cookies.set(authCookies.verifier, verifier, temporaryCookie);
    response.cookies.set(authCookies.nonce, nonce, temporaryCookie); response.cookies.set(authCookies.returnTo, returnTo, temporaryCookie);
    return response;
  } catch (error) {
    console.error('OIDC login configuration error', error);
    return NextResponse.redirect(new URL('/access-denied?reason=configuration', appUrl()));
  }
}
