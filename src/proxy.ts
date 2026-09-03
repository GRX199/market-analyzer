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

  // Refresh session if expired - required for Server Components
  const { data: { user } } = await supabase.auth.getUser();

  // Auth Guard
  if (pathname.startsWith('/login')) {
    // If logged in and trying to access login, redirect to dashboard
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  } else {
    // If not logged in and trying to access anything else, redirect to login
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
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
