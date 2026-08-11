"use client";

import { AppShell, PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAcademyCourses, useMyBadges, type CourseSummary, type AcademyLevel } from "@/lib/use-academy";
import { ArrowRight, Award, BookOpen, Clock, GraduationCap, Loader2, PlayCircle } from "lucide-react";
import Link from "next/link";

const LEVEL_LABEL: Record<AcademyLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function LevelBadge({ level }: { level: AcademyLevel }) {
  const styles: Record<AcademyLevel, string> = {
    beginner: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    intermediate: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    advanced: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${styles[level]}`}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

function CourseCard({ course }: { course: CourseSummary }) {
  const pct = course.progress?.percent ?? 0;
  const inProgress = course.enrolled && pct > 0 && pct < 100;
  const done = course.enrolled && pct === 100;

  return (
    <Link href={`/academy/${course.slug}`}>
      <Card className="group h-full cursor-pointer border-border/50 transition hover:border-primary/40 hover:shadow-md">
        <CardHeader>
          <div className="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-muted/60 to-muted/20">
            <GraduationCap className="h-10 w-10 text-muted-foreground/40 transition group-hover:text-primary/60" />
          </div>
          <div className="flex items-center gap-2">
            <LevelBadge level={course.level} />
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              {course.moduleCount} modules · {course.lessonCount} lessons
            </span>
          </div>
          <CardTitle className="font-display text-lg font-bold tracking-tight">{course.title}</CardTitle>
          <CardDescription className="line-clamp-2">{course.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatMinutes(course.estimatedMinutes)}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {course.enrolled ? `${course.progress.completedLessons}/${course.progress.totalLessons} done` : "Not enrolled"}
            </span>
          </div>
          <Progress value={pct} className={done ? "[&>div]:bg-emerald-500" : ""} />
          <div className="mt-3 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {done ? (
                <>
                  <Award className="h-3.5 w-3.5 text-emerald-400" /> Completed
                </>
              ) : inProgress ? (
                <>
                  <PlayCircle className="h-3.5 w-3.5 text-primary" /> {pct}% complete
                </>
              ) : (
                <>
                  <BookOpen className="h-3.5 w-3.5" /> {pct}% complete
                </>
              )}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AcademyPage() {
  const { data, isLoading, error } = useAcademyCourses();
  const { data: badgeData } = useMyBadges();

  const courses = data?.courses ?? [];
  const badges = badgeData?.badges ?? [];
  const hasAccess = !error || courses.length > 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ LEARN · FORGE ACADEMY"
        title="Academy"
        subtitle="Guided courses that take you from idea to published — with earned badges along the way."
      />

      {badges.length > 0 && (
        <Card className="mb-8 border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-400" />
              <CardTitle>Badges</CardTitle>
            </div>
            <CardDescription>Certificates earned by completing courses.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {badges.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3.5 py-1.5 text-xs"
                >
                  <Award className="h-4 w-4 text-amber-400" />
                  <span className="font-medium text-amber-300">{b.title}</span>
                  {b.courseTitle && <span className="text-amber-400/60">· {b.courseTitle}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasAccess ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <GraduationCap className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="font-display text-lg font-bold">No academy access yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Your workspace admin hasn&apos;t granted you access to any courses. Ask them to enable
              the Academy for your team.
            </p>
          </CardContent>
        </Card>
      ) : courses.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <GraduationCap className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="font-display text-lg font-bold">No courses published yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              New courses are being prepared. Check back soon.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}

      {badges.length > 0 && (
        <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
          <Award className="h-3.5 w-3.5" />
          {badges.length} badge{badges.length === 1 ? "" : "s"} earned
        </p>
      )}
    </AppShell>
  );
}
