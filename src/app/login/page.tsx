import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/app/login/actions";
import { LoginError } from "@/app/login/login-error";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-[0.2em]">REIOS</p>
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground">This dashboard is private to its owner.</p>
      </div>
      <Suspense>
        <LoginError />
      </Suspense>
      <form action={signInWithGoogle}>
        <Button type="submit" className="w-full">Continue with Google</Button>
      </form>
    </main>
  );
}
