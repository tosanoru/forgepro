"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "./Sidebar";

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
        <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-10 md:py-12">{children}</div>
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
  return (
    <div className="mb-10 pb-6 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {eyebrow || `\u2116 ${title.slice(0, 2).toUpperCase()} \u00B7 DISPATCH`}
        </div>
        <div className="hidden text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground sm:block">
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" })}
        </div>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}