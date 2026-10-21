import Link from "next/link";

export default function NotFound() {
  return (
    <main className="error-screen dashboard-shell">
      <p className="dialog-eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="error-copy">That page doesn&apos;t exist.</p>
      <Link className="btn-secondary" href="/">Back to REIOS</Link>
    </main>
  );
}
