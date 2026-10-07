"use client";

import type { ReactNode } from "react";
import { useAuth, useRedirectIfAuthenticated } from "@/lib/auth-context";
import { Splash } from "@/components/ui/Splash";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  useRedirectIfAuthenticated();

  // Already signed in — brief frame while the redirect to "/" fires.
  if (currentUser) {
    return <Splash />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground shadow-sm">
            S
          </div>
          <h1 className="text-xl font-semibold text-foreground">Signal Clone</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
