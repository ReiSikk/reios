import 'server-only';

import { AuthError } from 'next-auth';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { forbidden, redirect } from 'next/navigation';
import { encryptSecret } from '@/lib/crypto';
import { getSupabaseAdmin } from '@/lib/db';

const googleScope =
  'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly';

function isOwnerEmail(email: string | null | undefined): boolean {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(ownerEmail && email?.trim().toLowerCase() === ownerEmail);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          access_type: 'offline',
          prompt: 'consent',
          scope: googleScope,
        },
      },
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ account, user }) {
      if (!isOwnerEmail(user.email)) return false;
      if (account?.provider !== 'google') return false;

      if (!account.access_token) {
        throw new AuthError('Google did not return an access token.');
      }

      const supabase = getSupabaseAdmin();
      const { data: existingIntegration, error: readError } = await supabase
        .from('integrations')
        .select('refresh_token_enc')
        .eq('provider', 'google')
        .maybeSingle();

      if (readError) throw readError;

      const refreshToken = account.refresh_token
        ? await encryptSecret(account.refresh_token)
        : (existingIntegration?.refresh_token_enc ?? null);
      const { error: writeError } = await supabase.from('integrations').upsert({
        provider: 'google',
        access_token_enc: await encryptSecret(account.access_token),
        refresh_token_enc: refreshToken,
        expires_at: account.expires_at ? new Date(account.expires_at * 1000).toISOString() : null,
        scope: account.scope ?? googleScope,
        updated_at: new Date().toISOString(),
      });

      if (writeError) throw writeError;
      return true;
    },
  },
});

export async function requireOwner() {
  const session = await auth();

  if (!session?.user) redirect('/login');
  if (!isOwnerEmail(session.user.email)) forbidden();

  return session.user;
}
