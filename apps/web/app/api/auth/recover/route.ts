import { NextResponse } from 'next/server';
import { appUrl, demoAuthEnabled, oidcConfig } from '../../../../lib/auth';
export async function GET() {
  if (demoAuthEnabled()) return NextResponse.redirect(new URL('/forgot-password?demo=1', appUrl()));
  try { const url = oidcConfig().passwordResetUrl; return NextResponse.redirect(new URL(url || '/forgot-password?unavailable=1', appUrl())); }
  catch { return NextResponse.redirect(new URL('/forgot-password?unavailable=1', appUrl())); }
}
