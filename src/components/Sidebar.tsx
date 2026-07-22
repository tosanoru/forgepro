"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import useSWR from "swr";
import { LayoutDashboard, Users, Building2, Sparkles, Settings, Video, LayoutGrid, FolderOpen, DollarSign, Image, Loader2, Compass, CreditCard, ShieldCheck, LogOut, User, TrendingUp, Flag, Rocket } from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const NAV_GROUPS = [
  {
    label: "Create",
    items: [
      { href: "/content", label: "Content Planning", icon: LayoutGrid },
      { href: "/videos", label: "Video Review", icon: Video },
      { href: "/script", label: "AI Scripts", icon: Sparkles },
      { href: "/thumbnails", label: "Thumbnails", icon: Image },
    ],
  },
  {
    label: "Strategy",
    items: [
      { href: "/niche-finder", label: "Niche Finder", icon: Compass },
      { href: "/assets", label: "Brand Assets", icon: FolderOpen },
      { href: "/revenue", label: "Revenue", icon: DollarSign },
    ],
  },
  {
    label: "Grow",
    items: [
      { href: "/challenges/30-days-1k", label: "30 Days to 1k Challenge", icon: TrendingUp },
      { href: "/challenges/90-days-10k", label: "90 Days to 10k Challenge", icon: Flag },
      { href: "/challenges/120-days-100k", label: "120 Days to 100k Challenge", icon: Rocket },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/team", label: "Team", icon: Users },
      { href: "/settings", label: "AI Settings", icon: Settings },
      { href: "/settings/profile", label: "Profile", icon: User },
      { href: "/settings/billing", label: "Billing", icon: CreditCard },
    ],
  },
];

/**
 * No Forge equivalent for the workspace switcher — Forge only ever had one
 * flat workspace per user, so there was nothing to switch between.
 *
 * The switcher used to be display-only: it listed a person's workspaces
 * but selecting one did nothing, since there was no active-workspace
 * concept anywhere server-side. Fixed now — see
 * src/app/api/workspace/active/route.ts and ACTIVE_WORKSPACE_COOKIE in
 * src/lib/active-workspace.ts for where the selection actually lives.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, allWorkspaces, switchWorkspace } = useWorkspace();
  const [switching, setSwitching] = useState(false);
  // Every other nav item is workspace-scoped; this one isn't — it's
  // platform-wide. Fetched fresh rather than trusted from the session
  // token (see /api/admin/me for why) — worth the extra request, this
  // only fires once per Sidebar mount, not per nav render.
  const { data: adminStatus } = useSWR<{ isSuperAdmin: boolean }>("/api/admin/me", (url: string) => fetch(url).then((r) => r.json()));

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === workspace?.id) return;
    setSwitching(true);
    try {
      await switchWorkspace(workspaceId);
      // Every page's data hooks key off workspace.id, so a hard nav isn't
      // strictly required for data to update — but content-heavy pages
      // (the board, video list, etc.) can have local component state built
      // around the previous workspace's ids, so a refresh is the simplest
      // way to guarantee nothing stale lingers after a switch.
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch workspace");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary font-display text-sm font-bold text-primary-foreground">
          C
        </div>
        <span className="font-display text-lg font-bold tracking-tight">Forge 2</span>
      </div>

      <div className="border-b border-border px-4 py-3">
        <Select value={workspace?.id} onValueChange={handleSwitch} disabled={switching || allWorkspaces.length <= 1}>
          <SelectTrigger className="w-full text-xs">
            <div className="flex items-center gap-2 truncate">
              {switching ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <SelectValue placeholder="Workspace">{workspace?.name}</SelectValue>
            </div>
          </SelectTrigger>
          <SelectContent>
            {allWorkspaces.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <Link
          href="/"
          className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
        {adminStatus?.isSuperAdmin && (
          <>
            <div className="my-2 border-t border-border" />
            <Link
              href="/admin"
              className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors ${
                pathname.startsWith("/admin") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Super Admin
            </Link>
          </>
        )}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded border-2 border-red-600 px-3 py-2 text-xs font-medium uppercase tracking-widest text-red-600 transition-colors hover:bg-red-600 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
