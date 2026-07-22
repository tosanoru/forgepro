"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ShieldCheck, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isSuperAdmin: boolean;
  createdAt: string;
  ownedWorkspaceCount: number;
}

interface AdminWorkspace {
  id: string;
  name: string;
  type: string;
  plan: string;
  parentWorkspaceId: string | null;
  ownerId: string;
  ownerEmail: string;
  ownerName: string | null;
  createdAt: string;
  memberCount: number;
}

interface NicheCategory {
  id: string;
  category: string;
  keywords: string[];
  active: boolean;
  createdAt: string;
}

interface QuotaDay {
  date: string;
  units: number;
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  lite: "bg-indigo-stat/15 text-indigo-stat",
  pro: "bg-primary/15 text-primary",
};

function AdminContent() {
  const [userQuery, setUserQuery] = useState("");
  const [workspaceQuery, setWorkspaceQuery] = useState("");

  const {
    data: usersData,
    isLoading: usersLoading,
    mutate: mutateUsers,
  } = useSWR<{ users: AdminUser[] }>(`/api/admin/users?query=${encodeURIComponent(userQuery)}`, fetcher);
  const {
    data: workspacesData,
    isLoading: workspacesLoading,
    mutate: mutateWorkspaces,
  } = useSWR<{ workspaces: AdminWorkspace[] }>(`/api/admin/workspaces?query=${encodeURIComponent(workspaceQuery)}`, fetcher);

  const { data: categoriesData, isLoading: categoriesLoading, mutate: mutateCategories } = useSWR<{ categories: NicheCategory[] }>(
    "/api/admin/niche-categories",
    fetcher,
  );
  const { data: quotaData, isLoading: quotaLoading } = useSWR<{ budget: number; todayUsage: number; todayPercent: number; history: QuotaDay[] }>(
    "/api/admin/youtube-quota",
    fetcher,
    { refreshInterval: 60_000 }, // quota changes as crons/MCP calls run — worth a light auto-refresh, unlike the mostly-static users/workspaces tabs
  );

  const [newCategory, setNewCategory] = useState("");
  const [newKeywords, setNewKeywords] = useState("");

  const toggleSuperAdmin = async (userId: string, next: boolean) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSuperAdmin: next }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Failed to update");
      return;
    }
    toast.success(next ? "Granted super admin" : "Revoked super admin");
    mutateUsers();
  };

  const updatePlan = async (workspaceId: string, plan: string) => {
    const res = await fetch(`/api/admin/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Failed to update plan");
      return;
    }
    toast.success(`Plan set to ${plan}`);
    mutateWorkspaces();
  };

  const addCategory = async () => {
    const keywords = newKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (!newCategory.trim() || keywords.length === 0) {
      toast.error("Category name and at least one keyword are required");
      return;
    }
    const res = await fetch("/api/admin/niche-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: newCategory.trim(), keywords }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Failed to add category");
      return;
    }
    toast.success(`Added "${newCategory.trim()}"`);
    setNewCategory("");
    setNewKeywords("");
    mutateCategories();
  };

  const toggleCategoryActive = async (id: string, active: boolean) => {
    const res = await fetch(`/api/admin/niche-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Failed to update category");
      return;
    }
    mutateCategories();
  };

  const deleteCategory = async (id: string, category: string) => {
    if (!confirm(`Remove "${category}" from discovery? Existing niches/channels already found under it aren't deleted, only future discovery stops.`)) return;
    const res = await fetch(`/api/admin/niche-categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Failed to delete category");
      return;
    }
    toast.success("Category removed");
    mutateCategories();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 15 · SUPER ADMIN"
        title="Super Admin"
        subtitle="Platform-wide user and workspace management — not scoped to any one workspace."
      />

      <div className="mb-6 flex items-start gap-2 rounded border border-amber-stat/30 bg-amber-stat/5 p-3 text-xs text-amber-stat">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Plan changes here are manual overrides, not billing actions — they don&rsquo;t touch Stripe. Setting a plan
          here doesn&rsquo;t create, extend, or cancel a real subscription, and the next Stripe webhook event for that
          workspace can overwrite it back to whatever Stripe says.
        </span>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="workspaces">Workspaces & Plans</TabsTrigger>
          <TabsTrigger value="niche-categories">Niche Categories</TabsTrigger>
          <TabsTrigger value="youtube-quota">YouTube Quota</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Input
                placeholder="Search by name or email…"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                className="mb-4 max-w-sm"
              />
              {usersLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Owned workspaces</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Super admin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(usersData?.users ?? []).map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-medium">{u.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>{u.ownedWorkspaceCount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {u.isSuperAdmin && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                            <Switch checked={u.isSuperAdmin} onCheckedChange={(checked) => toggleSuperAdmin(u.id, checked)} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(usersData?.users ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No users found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workspaces" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Input
                placeholder="Search by workspace or owner email…"
                value={workspaceQuery}
                onChange={(e) => setWorkspaceQuery(e.target.value)}
                className="mb-4 max-w-sm"
              />
              {workspacesLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Plan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(workspacesData?.workspaces ?? []).map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>
                          <div className="font-medium">{w.name}</div>
                          {w.parentWorkspaceId && <div className="text-xs text-muted-foreground">Client workspace</div>}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{w.ownerName ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{w.ownerEmail}</div>
                        </TableCell>
                        <TableCell>{w.memberCount}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {w.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Select value={w.plan} onValueChange={(plan) => updatePlan(w.id, plan)}>
                            <SelectTrigger className="ml-auto w-28">
                              <SelectValue>
                                <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${PLAN_BADGE[w.plan] ?? ""}`}>{w.plan}</span>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="lite">Lite</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(workspacesData?.workspaces ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No workspaces found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="niche-categories" className="mt-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-end gap-2 rounded border border-border bg-muted/20 p-3">
                <div className="flex-1 min-w-[160px]">
                  <label className="mb-1 block text-xs text-muted-foreground">Category name</label>
                  <Input placeholder="e.g. woodworking" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                </div>
                <div className="flex-[2] min-w-[240px]">
                  <label className="mb-1 block text-xs text-muted-foreground">Keywords (comma-separated, max 5)</label>
                  <Input placeholder="e.g. beginner woodworking, diy furniture plans" value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} />
                </div>
                <Button onClick={addCategory}>Add category</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Each keyword costs 100 YouTube API quota units/day in the discovery cron (search.list). Deactivating a
                category (rather than deleting it) pauses discovery without losing the niches/channels already found
                under it.
              </p>
              {categoriesLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Keywords</TableHead>
                      <TableHead className="text-right">Active</TableHead>
                      <TableHead className="text-right">Remove</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(categoriesData?.categories ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium capitalize">{c.category}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.keywords.join(", ")}</TableCell>
                        <TableCell className="text-right">
                          <Switch checked={c.active} onCheckedChange={(checked) => toggleCategoryActive(c.id, checked)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => deleteCategory(c.id, c.category)}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(categoriesData?.categories ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No categories yet — the discovery cron seeds 26 defaults on its first run, or add one above.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="youtube-quota" className="mt-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {quotaLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : quotaData ? (
                <>
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="font-mono text-2xl">
                        {quotaData.todayUsage.toLocaleString()} <span className="text-sm text-muted-foreground">/ {quotaData.budget.toLocaleString()} units today</span>
                      </span>
                      <span className={`text-sm font-medium ${quotaData.todayPercent >= 80 ? "text-rose-stat" : "text-muted-foreground"}`}>
                        {quotaData.todayPercent}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${quotaData.todayPercent >= 80 ? "bg-rose-stat" : quotaData.todayPercent >= 60 ? "bg-amber-stat" : "bg-primary"}`}
                        style={{ width: `${Math.min(quotaData.todayPercent, 100)}%` }}
                      />
                    </div>
                    {quotaData.todayPercent >= 80 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-stat">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Over 80% of today&rsquo;s YouTube quota is used — the discovery cron and any live MCP calls
                        (find_channel_by_url, search_videos_by_topic) may start failing today if this keeps climbing.
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Last 14 days</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Units</TableHead>
                          <TableHead className="text-right">% of budget</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...quotaData.history].reverse().map((day) => (
                          <TableRow key={day.date}>
                            <TableCell className="text-sm">{day.date}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{day.units.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{Math.round((day.units / quotaData.budget) * 100)}%</TableCell>
                          </TableRow>
                        ))}
                        {quotaData.history.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                              No usage recorded yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

/**
 * Page-level gate, separate from AppShell's login-only gate. Checks
 * /api/admin/me (a fresh DB lookup, not a JWT claim — see that route's
 * comment) before rendering anything sensitive. The underlying API
 * routes enforce this independently too (requireSuperAdmin on every
 * /api/admin/* call) — this page-level check is about not flashing admin
 * UI to a non-admin for a moment, not the actual security boundary.
 */
export default function AdminPage() {
  const { data, isLoading } = useSWR<{ isSuperAdmin: boolean }>("/api/admin/me", fetcher);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground font-mono text-[11px] uppercase tracking-[0.25em]">
        Loading…
      </div>
    );
  }

  if (!data?.isSuperAdmin) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You don&rsquo;t have super admin access.</p>
        </div>
      </AppShell>
    );
  }

  return <AdminContent />;
}
