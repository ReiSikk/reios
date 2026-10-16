"use client";

import { useSearchParams } from "next/navigation";

export function LoginError() {
  const searchParams = useSearchParams();

  if (searchParams.get("error") !== "AccessDenied") return null;

  return (
    <p role="alert" className="text-sm text-destructive">
      Access is restricted to the configured owner account.
    </p>
  );
}
