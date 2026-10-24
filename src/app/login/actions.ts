'use server';

import { signIn } from '@/lib/auth';

export async function signInWithGoogle(): Promise<void> {
  await signIn('google', { redirectTo: '/' });
}
