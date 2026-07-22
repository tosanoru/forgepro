"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "./Sidebar";

/**
 * Adapted from Forge's AppShell.tsx. Kept: the auth-gate redirect pattern,
 * the loading state, the overall flex layout. Dropped: the YouTube-creator
 * "ticker" strip (Forge-specific content, not relevant here). Added: no
 * ticker replacement yet — that slot is free for a future
 * notifications/activity strip once there's cross-module activity to show.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground font-mono text-[11px] uppercase tracking-[0.25em]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="mx-auto w-full max-w-7xl px-5 py-8 md:px-10 md:py-12">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  const stamp = eyebrow || `№ ${title.slice(0, 2).toUpperCase()} · DISPATCH`;
  return (
    <div className="mb-10 border-b-2 border-foreground pb-6">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">{stamp}</div>
        <div className="hidden font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground sm:block">
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" })}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
