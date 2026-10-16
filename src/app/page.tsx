import { Suspense } from "react";
import { requireOwner } from "@/lib/auth";

export default function Home() {
  return (
    <Suspense fallback={<main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">Loading REIOS…</main>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const owner = await requireOwner();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 px-6 py-10">
      <p className="text-sm font-semibold tracking-[0.2em]">REIOS</p>
      <h1 className="text-3xl font-semibold">Welcome, {owner.name ?? "Rei"}</h1>
      <p className="text-muted-foreground">Your private admin dashboard is ready for setup.</p>
    </main>
  );
}
