import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isWorkerRoute = pathname === '/api/trades/claim'
    || (request.method === 'POST' && pathname === '/api/trade-intelligence/ingest')
    || (request.method === 'POST' && pathname === '/api/trading/notifications')
    || (request.method === 'PATCH' && /^\/api\/trades\/[^/]+$/.test(pathname));

  // Machine-to-machine routes authenticate their bearer secret in the route
  // handler. Avoid coupling them to Supabase browser-session availability.
  if (
    pathname.startsWith('/api/cron')
    || pathname.startsWith('/_next')
    || isWorkerRoute
  ) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Keep refreshed/cleared session cookies even when returning an auth error
  // or redirect instead of the original pass-through response.
  const withSessionCookies = (result: NextResponse) => {
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    result.headers.set('Cache-Control', 'no-store');
    return result;
  };
  let user: { id: string } | null = null;
  let verificationUnavailable = false;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    verificationUnavailable = !!result.error && (
      result.error.name === 'AuthRetryableFetchError' || (result.error.status ?? 0) >= 500
    );
  } catch {
    verificationUnavailable = true;
  }

  // Fetch callers must receive JSON, not a 307 followed by a successful HTML
  // login page. This remains fail-closed; route-level authorization still runs.
  if (pathname.startsWith('/api/') && (verificationUnavailable || !user)) {
    return withSessionCookies(NextResponse.json({
      error: verificationUnavailable
        ? 'Layanan autentikasi sementara tidak tersedia. Coba lagi setelah koneksi pulih.'
        : 'Sesi login tidak tersedia atau kedaluwarsa. Silakan masuk kembali.',
      code: verificationUnavailable ? 'AUTH_UNAVAILABLE' : 'AUTH_REQUIRED',
    }, { status: verificationUnavailable ? 503 : 401 }));
  }

  // Auth Guard
  if (pathname.startsWith('/login')) {
    // If logged in and trying to access login, redirect to dashboard
    if (user) {
      return withSessionCookies(NextResponse.redirect(new URL('/dashboard', request.url)));
    }
  } else {
    // If not logged in and trying to access anything else, redirect to login
    if (!user) {
      return withSessionCookies(NextResponse.redirect(new URL('/login', request.url)));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
