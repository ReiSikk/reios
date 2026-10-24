import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export default auth((request) => {
  const sessionEmail = request.auth?.user?.email?.trim().toLowerCase();
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();

  if (!ownerEmail || sessionEmail !== ownerEmail) {
    return NextResponse.redirect(new URL('/login?error=AccessDenied', request.url));
  }
});

export const config = {
  matcher: ['/((?!api/auth|api/cron|login|_next/static|_next/image|favicon.ico).*)'],
};
