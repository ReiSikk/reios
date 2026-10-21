"use client";

import "./globals.css";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <main className="error-screen dashboard-shell">
          <p className="dialog-eyebrow">REIOS</p>
          <h1>Something went wrong</h1>
          <p className="error-copy">The app couldn&apos;t load this time.</p>
          <button type="button" className="btn-primary" onClick={retry}>Try again</button>
        </main>
      </body>
    </html>
  );
}
