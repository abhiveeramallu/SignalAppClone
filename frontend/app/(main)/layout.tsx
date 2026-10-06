"use client";

import type { ReactNode } from "react";
import { useAuth, useRequireAuth } from "@/lib/auth-context";
import { Splash } from "@/components/ui/Splash";

export default function MainLayout({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  useRequireAuth();

  // Not signed in — brief frame while the redirect to /login fires.
  if (!currentUser) {
    return <Splash />;
  }

  // AppShell (rendered by the page) owns the full viewport layout itself.
  return <>{children}</>;
}
