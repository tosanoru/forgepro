"use client";

import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useWorkspace } from "@/lib/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Crown, ShieldCheck, PenLine, Eye, Link2, Loader2, Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { WorkspaceRole } from "@/lib/workspace-types";

function initials(name: string | null, email: string) {
  const base = name?.trim() || email;
  return base.slice(0, 2).toUpperCase();
}

// Widened from Forge's 3-role ROLE_META (owner/admin/member) to all 5 roles.
const ROLE_META: Record<WorkspaceRole, { label: string; icon: typeof Crown; tone: string }> = {
  owner: { label: "Owner", icon: Crown, tone: "bg-amber-stat/15 text-amber-stat" },
  admin: { label: "Admin", icon: ShieldCheck, tone: "bg-indigo-stat/15 text-indigo-stat" },
  editor: { label: "Editor", icon: PenLine, tone: "bg-muted text-muted-foreground" },
  reviewer: { label: "Reviewer", icon: Eye, tone: "bg-muted text-muted-foreground" },
  client_viewer: { label: "Client", icon: Link2, tone: "bg-rose-stat/15 text-rose-stat" },
};

const INVITABLE_ROLES: WorkspaceRole[] = ["admin", "editor", "reviewer", "client_viewer"];

export default function TeamPage() {
  const { workspace, members, role, children, loading, invite, createClientWorkspace } = useWorkspace();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("editor");
  const [inviting, setInviting] = useState(false);
  const [clientName, setClientName] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  const canInvite = role === "owner" || role === "admin";
  const isAgency = workspace?.type === "agency";

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      const result = await invite(email.trim(), inviteRole);
      toast.success(
        result.status === "added"
          ? `${email} added to the team`
          : `Invite sent — ${email} will join automatically when they sign up`,
      );
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const submitClientWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    setCreatingClient(true);
    try {
      await createClientWorkspace(clientName.trim());
      toast.success(`${clientName} workspace created`);
      setClientName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create client workspace");
    } finally {
      setCreatingClient(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 02 · TEAM"
        title="Team"
        subtitle={workspace ? `Everyone with access to ${workspace.name}.` : "Everyone with access to this workspace."}
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 border border-border bg-card">
              <div className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {members.length} {members.length === 1 ? "member" : "members"}
              </div>
              <ul className="divide-y divide-border">
                {members.map((m) => {
                  const meta = ROLE_META[m.role];
                  const RoleIcon = meta.icon;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-mono text-xs font-bold text-muted-foreground">
                        {m.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initials(m.name, m.email)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{m.name || m.email}</div>
                        {m.name && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.tone}`}>
                        <RoleIcon className="h-2.5 w-2.5" /> {meta.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="lg:col-span-2">
              {canInvite ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-primary" />
                      <CardTitle>Invite a teammate</CardTitle>
                    </div>
                    <CardDescription>
                      Existing accounts are added immediately. New emails join automatically on sign-up.
                      Use &ldquo;Client&rdquo; for external approval-only access.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={submitInvite} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="invite-email">Email</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          required
                          placeholder="teammate@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Role</Label>
                        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as WorkspaceRole)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVITABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_META[r].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" disabled={inviting} className="w-full">
                        {inviting ? "Inviting…" : "Send invite"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <div className="border border-dashed border-border p-5 text-xs text-muted-foreground">
                  Only workspace owners and admins can invite teammates.
                </div>
              )}
            </div>
          </div>

          {isAgency && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 border border-border bg-card">
                <div className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {children.length} client {children.length === 1 ? "workspace" : "workspaces"}
                </div>
                <ul className="divide-y divide-border">
                  {children.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-semibold">{c.name}</span>
                    </li>
                  ))}
                  {children.length === 0 && (
                    <li className="px-5 py-6 text-center text-xs text-muted-foreground">No client workspaces yet.</li>
                  )}
                </ul>
              </div>
              {canInvite && (
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4 text-primary" />
                        <CardTitle>New client workspace</CardTitle>
                      </div>
                      <CardDescription>Gives this client their own isolated space for review and approval.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={submitClientWorkspace} className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="client-name">Client name</Label>
                          <Input
                            id="client-name"
                            required
                            placeholder="Acme Church"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                          />
                        </div>
                        <Button type="submit" disabled={creatingClient} className="w-full">
                          {creatingClient ? "Creating…" : "Create workspace"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
