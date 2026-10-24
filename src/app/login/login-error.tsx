'use client';

import { useSearchParams } from 'next/navigation';

export function LoginError() {
  const searchParams = useSearchParams();

  if (searchParams.get('error') !== 'AccessDenied') return null;

  return (
    <div role="alert" className="login-error-state">
      <p className="text-sm text-destructive">
        Access is restricted to the configured owner account.
      </p>
      <a className="btn-secondary" href="/login">
        Try again
      </a>
    </div>
  );
}
