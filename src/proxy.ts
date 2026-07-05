import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const basicAuth = req.headers.get('authorization');
  const url = req.nextUrl;

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');

    // Default credentials if env vars are missing
    const validUser = process.env.BASIC_AUTH_USER || 'admin';
    const validPass = process.env.BASIC_AUTH_PASSWORD || 'market2026';

    if (user === validUser && pwd === validPass) {
      return NextResponse.next();
    }
  }
  
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Private Market Analyzer Area"',
    },
  });
}

// Ensure middleware only runs on actual pages and API routes (excluding static files, images, etc.)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
