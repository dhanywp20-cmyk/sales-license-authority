import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESI, dashboardAktif, sesiSah } from '@/lib/sesi';

/**
 * Dashboard web developer hanya bisa dibuka setelah login di /masuk (sandi =
 * CENTRAL_ADMIN_SECRET). API deployment (/api/v1), webhook Telegram, dan cron
 * punya autentikasinya sendiri dan tidak lewat sini. Tanpa CENTRAL_ADMIN_SECRET
 * yang layak, dashboard dimatikan — tidak ada sandi bawaan.
 */
export async function middleware(request: NextRequest) {
  if (!dashboardAktif()) {
    return new NextResponse('Dashboard dinonaktifkan: CENTRAL_ADMIN_SECRET belum diset (min. 24 karakter).', { status: 503 });
  }
  const { pathname, search } = request.nextUrl;
  const masuk = await sesiSah(request.cookies.get(COOKIE_SESI)?.value);

  if (pathname === '/masuk') {
    return masuk ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (masuk) return NextResponse.next();

  if (request.method !== 'GET') {
    return new NextResponse('Sesi berakhir. Silakan masuk kembali.', { status: 401 });
  }
  const tujuan = new URL('/masuk', request.url);
  if (pathname !== '/') tujuan.searchParams.set('ke', pathname + search);
  return NextResponse.redirect(tujuan);
}

export const config = {
  matcher: ['/((?!api/v1/|api/telegram/|api/cron|_next/static|_next/image|favicon.ico|icon.png|logo.png).*)'],
};
