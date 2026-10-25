'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { reloadLhvTokensFromEnvironment } from './index';

export async function reconnectLhvTokens(): Promise<void> {
  await requireOwner();
  await reloadLhvTokensFromEnvironment();
  revalidatePath('/');
}
