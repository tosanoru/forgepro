"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useWorkspace } from "@/lib/use-workspace";
import { useAcademyCourses } from "@/lib/use-academy";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, GraduationCap, Lock } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Grant {
  id: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  grantedAt: string;
  revokedAt: string | null;
}

export default function AcademyAccessPage() {
  const { workspace, members, role } = useWorkspace();
  const { data: coursesData } = useAcademyCourses();
  const { data: grantsData, mutate } = useSWR<{ grants: Grant[] }>(
    workspace ? `/api/workspaces/${workspace.id}/academy/access` : null,
    fetcher,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const canManage = role === "owner" || role === "admin";

  const toggle = useCallback(
    async (userId: string, courseId: string, grant: Grant | undefined) => {
      if (!workspace) return;
      const key = `${userId}:${courseId}`;
      setBusyKey(key);
      try {
        const url = grant
          ? `/api/workspaces/${workspace.id}/academy/access/${grant.id}`
          : `/api/workspaces/${workspace.id}/academy/access`;
        const res = await fetch(url, {
          method: grant ? "DELETE" : "POST",
          headers: grant ? undefined : { "Content-Type": "application/json" },
          body: grant ? undefined : JSON.stringify({ userId, courseId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to update access");
        await mutate();
        toast.success(grant ? "Access revoked" : "Access granted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update access");
      } finally {
        setBusyKey(null);
      }
    },
    [workspace, mutate],
  );

  const courses = coursesData?.courses ?? [];
  const grants = grantsData?.grants ?? [];

  // userId -> courseId -> active grant row (non-revoked).
  const grantByUserCourse = new Map<string, Map<string, Grant>>();
  for (const g of grants) {
    if (g.revokedAt) continue;
    const byCourse = grantByUserCourse.get(g.userId) ?? new Map<string, Grant>();
    byCourse.set(g.courseId, g);
    grantByUserCourse.set(g.userId, byCourse);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 07 · ACADEMY"
        title="Academy Access"
        subtitle="Grant or revoke access to Forge 2 Academy courses per team member. Admins and owners always have access to every course."
      />

      {!canManage ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Restricted</CardTitle>
            </div>
            <CardDescription>
              Only workspace owners and admins can manage Academy access. You&rsquo;re a {role ?? "member"} — your
              existing course access is unaffected.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              <CardTitle>Team access matrix</CardTitle>
            </div>
            <CardDescription>
              Toggle a switch to grant or revoke that course for a member. Revoking resets their progress in that
              course; granting again starts them fresh.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!workspace || (!courses.length && !grants.length) ? (
              <div className="flex h-32 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                        Member
                      </th>
                      {courses.map((c) => (
                        <th key={c.id} className="px-3 py-2 text-xs font-medium text-muted-foreground">
                          {c.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 pr-4">
                          <p className="font-medium">{member.name ?? member.email}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </td>
                        {courses.map((course) => {
                          const grant = grantByUserCourse.get(member.id)?.get(course.id);
                          const key = `${member.id}:${course.id}`;
                          return (
                            <td key={course.id} className="px-3 py-2.5 text-center">
                              <Switch
                                checked={Boolean(grant)}
                                disabled={busyKey !== null}
                                onCheckedChange={() => toggle(member.id, course.id, grant)}
                                aria-label={`${grant ? "Revoke" : "Grant"} ${course.title} for ${member.name ?? member.email}`}
                              />
                              {busyKey === key && <span className="sr-only">Saving…</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
