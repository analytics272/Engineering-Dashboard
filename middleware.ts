import { NextRequest, NextResponse } from 'next/server';

/**
 * HTTP Basic Auth gate for the whole dashboard.
 *
 * Set BOTH env vars to turn it on (locally in .env.local, in Vercel under
 * Project → Settings → Environment Variables):
 *
 *   DASHBOARD_USER=skyla
 *   DASHBOARD_PASSWORD=<a long random string>
 *
 * If either is missing the gate is disabled (useful for first deploy / preview).
 * The browser shows a native username/password prompt; credentials are cached
 * by the browser for the session.
 */
export const config = {
  // everything except Next internals and the logo/favicon assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|skyla-icon).*)'],
};

function unauthorized() {
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Skyla Engineering Dashboard", charset="UTF-8"' },
  });
}

export function middleware(req: NextRequest) {
  const USER = process.env.DASHBOARD_USER;
  const PASS = process.env.DASHBOARD_PASSWORD;
  if (!USER || !PASS) return NextResponse.next(); // gate not configured

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = atob(header.slice(6));
    } catch {
      return unauthorized();
    }
    const i = decoded.indexOf(':');
    const user = decoded.slice(0, i);
    const pass = decoded.slice(i + 1);
    if (user === USER && pass === PASS) return NextResponse.next();
  }
  return unauthorized();
}
