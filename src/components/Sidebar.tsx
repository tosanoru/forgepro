"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import useSWR from "swr";
import { LayoutDashboard, Users, Building2, Sparkles, Settings, Video, LayoutGrid, FolderOpen, DollarSign, Image, Loader2, Compass, CreditCard, ShieldCheck, LogOut, User, TrendingUp, Flag, Rocket, Plus, PenLine, MessageSquare, ChevronsUpDown, GraduationCap, BarChart2 } from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

const NAV_GROUPS: {
  label: string;
  items: { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }[];
}[] = [
  {
    label: "Create",
    items: [
      { href: "/content", label: "Content Planning", icon: LayoutGrid },
      { href: "/videos", label: "Video Review", icon: Video },
      { href: "/ai-script", label: "AI Scripts", icon: Sparkles },
      { href: "/script", label: "Script", icon: PenLine },
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
      { href: "/challenges/30-days-1k", label: "30 Days to 1k", icon: TrendingUp },
      { href: "/challenges/90-days-10k", label: "90 Days to 10k", icon: Flag },
      { href: "/challenges/120-days-100k", label: "120 Days to 100k", icon: Rocket },
    ],
  },
  {
    label: "Learn",
    items: [{ href: "/academy", label: "Academy", icon: GraduationCap }],
  },
  {
    label: "Account",
    items: [
      { href: "/team", label: "Team", icon: Users },
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/settings", label: "AI Settings", icon: Settings },
      { href: "/settings/academy", label: "Academy Access", icon: GraduationCap },
      { href: "/settings/academy/team-progress", label: "Team Progress", icon: BarChart2, adminOnly: true },
      { href: "/settings/profile", label: "Profile", icon: User },
      { href: "/settings/billing", label: "Billing", icon: CreditCard },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, allWorkspaces, switchWorkspace, createWorkspace, renameWorkspace, role } = useWorkspace();
  const [switching, setSwitching] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [createValue, setCreateValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: adminStatus } = useSWR<{ isSuperAdmin: boolean }>("/api/admin/me", (url: string) => fetch(url).then((r) => r.json()));

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === workspace?.id) return;
    setSwitching(true);
    try {
      await switchWorkspace(workspaceId);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch workspace");
    } finally {
      setSwitching(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim() || !workspace) return;
    setSubmitting(true);
    try {
      await renameWorkspace(renameValue.trim());
      toast.success("Workspace renamed");
      setRenameOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename workspace");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createValue.trim()) return;
    setSubmitting(true);
    try {
      await createWorkspace(createValue.trim());
      toast.success("Workspace created");
      setCreateOpen(false);
      setCreateValue("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setSubmitting(false);
    }
  };

  // Longest-prefix-match: a nav item is active when the current pathname is
  // at or under its href, but only if no sibling nav item claims a deeper
  // prefix. This keeps real child routes (e.g. /videos/[id], /academy/[slug],
  // /niche-finder/[id]) highlighting their parent, while preventing sibling
  // routes sharing a prefix (e.g. /settings vs /settings/academy vs
  // /settings/academy/team-progress) from all highlighting at once.
  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (!(pathname === href || pathname.startsWith(href + "/"))) return false;
    const candidates = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href))
      .filter((h) => h !== "/" && (pathname === h || pathname.startsWith(h + "/")));
    const best = candidates.sort((a, b) => b.length - a.length)[0];
    return best === href;
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-sidebar-border">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground font-display">
          F
        </div>
        <span className="font-display text-base font-bold tracking-tight text-sidebar-foreground">Forge 2</span>
      </div>

      <div className="px-3 py-2.5 border-b border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground transition-colors">
              {switching ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <Building2 className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate text-left flex-1 font-medium">{workspace?.name ?? "Workspace"}</span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-56">
            {allWorkspaces.length > 1 && (
              <>
                <DropdownMenuRadioGroup value={workspace?.id} onValueChange={handleSwitch}>
                  {allWorkspaces.map((ws) => (
                    <DropdownMenuRadioItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => { setCreateValue(""); setCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              New workspace
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setRenameValue(workspace?.name ?? ""); setRenameOpen(true); }}>
              <PenLine className="mr-2 h-4 w-4" />
              Rename workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>Change the name of &ldquo;{workspace?.name}&rdquo;.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRename}>
            <div className="space-y-1.5 py-4">
              <Label htmlFor="rename">Name</Label>
              <Input id="rename" required value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="My Workspace" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !renameValue.trim()}>
                {submitting ? "Saving\u2026" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>Create a new workspace to organize content and clients.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-1.5 py-4">
              <Label htmlFor="create">Workspace name</Label>
              <Input id="create" required value={createValue} onChange={(e) => setCreateValue(e.target.value)} placeholder="My Agency" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !createValue.trim()}>
                {submitting ? "Creating\u2026" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
        <Link
          href="/"
          className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
            isActive("/")
              ? "bg-sidebar-accent/10 text-primary"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/5 hover:text-sidebar-foreground/90"
          }`}
        >
          {isActive("/") && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />}
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 px-3 text-[10px] font-mono uppercase tracking-[0.15em] text-sidebar-foreground/40">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                if (item.adminOnly && role !== "owner" && role !== "admin") return null;
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      active
                        ? "bg-sidebar-accent/10 text-primary"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/5 hover:text-sidebar-foreground/90"
                    }`}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />}
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {adminStatus?.isSuperAdmin && (
          <div>
            <div className="mb-1.5 px-3 text-[10px] font-mono uppercase tracking-[0.15em] text-sidebar-foreground/40">
              Admin
            </div>
            <Link
              href="/admin"
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive("/admin")
                  ? "bg-sidebar-accent/10 text-primary"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/5 hover:text-sidebar-foreground/90"
              }`}
            >
              {isActive("/admin") && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />}
              <ShieldCheck className="h-4 w-4" />
              Super Admin
            </Link>
          </div>
        )}      </nav>

      <div className="border-t border-sidebar-border px-3 py-3">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}