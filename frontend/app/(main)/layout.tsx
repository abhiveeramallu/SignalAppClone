"use client";

import type { ReactNode } from "react";
import { useAuth, useRequireAuth } from "@/lib/auth-context";
import { Splash } from "@/components/ui/Splash";
import { NavRail } from "@/components/layout/NavRail";

export default function MainLayout({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  useRequireAuth();

  // Not signed in — brief frame while the redirect to /login fires.
  if (!currentUser) {
    return <Splash />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <NavRail />
      <div className="flex min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
