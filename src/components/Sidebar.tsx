"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import useSWR from "swr";
import { LayoutDashboard, Users, Building2, Sparkles, Settings, Video, LayoutGrid, FolderOpen, DollarSign, Image, Loader2, Compass, CreditCard, ShieldCheck, LogOut, User, TrendingUp, Flag, Rocket, Plus, PenLine, MessageSquare } from "lucide-react";
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

const NAV_GROUPS = [
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
      { href: "/challenges/30-days-1k", label: "30 Days to 1k Challenge", icon: TrendingUp },
      { href: "/challenges/90-days-10k", label: "90 Days to 10k Challenge", icon: Flag },
      { href: "/challenges/120-days-100k", label: "120 Days to 100k Challenge", icon: Rocket },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/team", label: "Team", icon: Users },
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/settings", label: "AI Settings", icon: Settings },
      { href: "/settings/profile", label: "Profile", icon: User },
      { href: "/settings/billing", label: "Billing", icon: CreditCard },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, allWorkspaces, switchWorkspace, createWorkspace, renameWorkspace } = useWorkspace();
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

  const openRename = () => {
    setRenameValue(workspace?.name ?? "");
    setRenameOpen(true);
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              {switching ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <Building2 className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate text-left flex-1">{workspace?.name ?? "Workspace"}</span>
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
            <DropdownMenuItem onClick={openRename}>
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
                {submitting ? "Saving…" : "Save"}
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
                {submitting ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
