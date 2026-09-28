import { NextRequest, NextResponse } from 'next/server';
import { appUrl, authCookies, demoAuthEnabled, oidcConfig } from '../../../../lib/auth';

export async function GET(request: NextRequest) {
  let target = new URL('/signed-out', appUrl());
  if (!demoAuthEnabled()) {
    try {
      const config = oidcConfig();
      if (config.endSessionUrl) {
        target = new URL(config.endSessionUrl); target.searchParams.set('post_logout_redirect_uri', `${appUrl()}/signed-out`);
        const idToken = request.cookies.get(authCookies.idToken)?.value; if (idToken) target.searchParams.set('id_token_hint', idToken);
      }
    } catch { /* Local session must still be cleared when provider configuration changed. */ }
  }
  const response = NextResponse.redirect(target);
  response.cookies.set(authCookies.session, '', { path: '/', maxAge: 0 }); response.cookies.set(authCookies.idToken, '', { path: '/api/auth/logout', maxAge: 0 });
  return response;
}
