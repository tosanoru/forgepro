"use client";

import useSWR from "swr";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useWorkspace } from "@/lib/use-workspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, GraduationCap, Lock, ArrowUpRight } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TeamMember {
  userId: string;
  role: string;
  name: string | null;
  email: string;
  image: string | null;
  courses: {
    courseId: string;
    courseSlug: string;
    courseTitle: string;
    completedLessons: number;
    totalLessons: number;
    percent: number;
  }[];
}

export default function AcademyTeamProgressPage() {
  const { workspace, role } = useWorkspace();
  const { data, isLoading } = useSWR<{ team: TeamMember[] }>(
    workspace ? `/api/workspaces/${workspace.id}/academy/team-progress` : null,
    fetcher,
  );

  const canView = role === "owner" || role === "admin";
  const team = data?.team ?? [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 07 · ACADEMY"
        title="Team Progress"
        subtitle="Completion across all published courses, per team member. Admin and owner only."
        action={
          <Link
            href="/settings/academy"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Access panel <ArrowUpRight className="h-3 w-3" />
          </Link>
        }
      />

      {!canView ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Restricted</CardTitle>
            </div>
            <CardDescription>
              Only workspace owners and admins can view team Academy progress.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading || !workspace ? (
        <div className="flex h-32 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : team.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No team members yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {team.map((member) => {
            const overall =
              member.courses.reduce((sum, c) => sum + c.percent, 0) /
              Math.max(member.courses.length, 1);
            const inProgress = member.courses.filter((c) => c.percent > 0 && c.percent < 100).length;
            return (
              <Card key={member.userId}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-sm font-semibold">
                        {member.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={member.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-sm">{member.name ?? member.email}</CardTitle>
                        <CardDescription className="text-xs">{member.email}</CardDescription>
                      </div>
                    </div>
                    <span className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-xs capitalize text-muted-foreground">
                      {member.role}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {member.courses.map((course) => (
                    <div key={course.courseId} className="mb-3 last:mb-0">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <Link
                          href={`/academy/${course.courseSlug}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {course.courseTitle}
                        </Link>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          {course.completedLessons}/{course.totalLessons} · {course.percent}%
                        </span>
                      </div>
                      <Progress value={course.percent} />
                    </div>
                  ))}
                  {member.courses.length === 0 && (
                    <p className="py-3 text-center text-xs text-muted-foreground">No published courses.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
