"use client";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="error-screen dashboard-shell">
      <p className="dialog-eyebrow">REIOS</p>
      <h1>Something went wrong</h1>
      <p className="error-copy">The dashboard couldn&apos;t load this time.</p>
      <button type="button" className="btn-primary" onClick={retry}>Try again</button>
    </main>
  );
}
