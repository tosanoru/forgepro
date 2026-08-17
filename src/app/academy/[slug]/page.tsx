"use client";

import { AppShell, PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  enrollInCourse,
  useAcademyCourse,
  useAcademyLesson,
  useAcademyProgress,
  useLessonProgress,
  type AcademyLevel,
} from "@/lib/use-academy";
import MuxPlayer from "@mux/mux-player-react";
import { cn } from "@/lib/utils";
import {
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  GraduationCap,
  Loader2,
  Lock,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

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

export default function AcademyCoursePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data: courseData, isLoading: courseLoading, error: courseError } = useAcademyCourse(slug);
  const { data: progressData } = useAcademyProgress(slug);

  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  const allLessons = useMemo(() => {
    const out: { id: string; moduleTitle: string }[] = [];
    for (const m of courseData?.modules ?? []) {
      for (const l of m.lessons) out.push({ id: l.id, moduleTitle: m.title });
    }
    return out;
  }, [courseData]);

  const continueLessonId = progressData?.continueLessonId ?? null;

  const activeLessonId =
    selectedLessonId ??
    (continueLessonId && allLessons.some((l) => l.id === continueLessonId) ? continueLessonId : null) ??
    allLessons[0]?.id;

  const { data: lessonData } = useAcademyLesson(slug, activeLessonId);

  const { trigger: triggerProgress, isMutating: progressSaving } = useLessonProgress(activeLessonId);

  const [enrolling, setEnrolling] = useState(false);

  const course = courseData?.course;
  const enrolled = courseData?.enrolled ?? false;
  const lesson = lessonData?.lesson;
  const lessonProgress = lessonData?.progress ?? null;
  const navigation = lessonData?.navigation;

  const handleEnroll = useCallback(async () => {
    if (!slug) return;
    setEnrolling(true);
    try {
      await enrollInCourse(slug);
      toast.success("Enrolled — start the course!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enroll");
    } finally {
      setEnrolling(false);
    }
  }, [slug]);

  const saveProgress = useCallback(
    async (payload: { status?: "in_progress" | "completed"; actionItemCompleted?: boolean }) => {
      if (!activeLessonId) return;
      try {
        const res = await triggerProgress(payload);
        const badge = res?.badgeAwarded as { slug: string; title: string } | undefined;
        if (badge) {
          toast.success(`Badge earned: ${badge.title}`, { icon: <Award className="h-4 w-4 text-amber-400" /> });
        } else if (payload.status === "completed") {
          toast.success("Lesson completed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save progress");
      }
    },
    [activeLessonId, triggerProgress],
  );

  const markComplete = useCallback(() => saveProgress({ status: "completed" }), [saveProgress]);
  const markInProgress = useCallback(() => saveProgress({ status: "in_progress" }), [saveProgress]);

  const toggleActionItem = useCallback(() => {
    saveProgress({ actionItemCompleted: !(lessonProgress?.actionItemCompleted ?? false) });
  }, [saveProgress, lessonProgress]);

  const goToLesson = useCallback((id: string) => setSelectedLessonId(id), []);

  if (courseLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (courseError || !course) {
    return (
      <AppShell>
        <PageHeader eyebrow="№ LEARN · ACADEMY" title="Course not found" />
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <GraduationCap className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="font-display text-lg font-bold">This course is unavailable</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              It may not exist, may be unpublished, or your workspace hasn&apos;t been granted access.
            </p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const lessonIndex = navigation?.lessonIndex ?? 0;
  const totalLessons = navigation?.totalLessons ?? 0;
  const prevLessonId = navigation?.prevLessonId ?? null;
  const nextLessonId = navigation?.nextLessonId ?? null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`№ LEARN · ${LEVEL_LABEL[course.level].toUpperCase()}`}
        title={course.title}
        subtitle={course.description}
        action={
          !enrolled ? (
            <Button onClick={handleEnroll} disabled={enrolling} className="gap-2">
              {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              {enrolling ? "Enrolling…" : "Enroll"}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Module / lesson sidebar ── */}
        <Card className="h-fit border-border/50 lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="font-display text-base font-bold">Course contents</CardTitle>
            <CardDescription>
              {progressData?.progress.completedLessons ?? 0}/{progressData?.progress.totalLessons ?? 0} lessons
              · {Math.round(progressData?.progress.percent ?? 0)}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Progress value={progressData?.progress.percent ?? 0} />
            </div>
            <div className="space-y-4">
              {courseData?.modules.map((m) => (
                <div key={m.id}>
                  <p className="mb-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    {m.title}
                  </p>
                  <div className="space-y-0.5">
                    {m.lessons.map((l) => {
                      const active = l.id === activeLessonId;
                      const done = l.progress?.status === "completed";
                      return (
                        <button
                          key={l.id}
                          onClick={() => goToLesson(l.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition",
                            active
                              ? "bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                          )}
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                          ) : active ? (
                            <PlayCircle className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-mono text-[11px] text-muted-foreground/70">{l.lessonNumber} · </span>
                            {l.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Lesson reading pane ── */}
        <div className="lg:col-span-2">
          {!lesson ? (
            <Card className="border-border/50">
              <CardContent className="py-16 text-center">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading lesson…</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              <Card className="border-border/50">
                <CardHeader>
                  <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    <span>{lesson.lessonNumber}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {formatMinutes(lesson.estimatedMinutes)}
                    </span>
                  </div>
                  <CardTitle className="font-display text-2xl font-bold tracking-tight">
                    {lesson.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {lesson.videoUrl ? (
                    lesson.videoProvider === "mux" ? (
                      <MuxPlayer
                        key={lesson.videoUrl}
                        src={lesson.videoUrl}
                        className="mb-5 aspect-video w-full overflow-hidden rounded-lg"
                      />
                    ) : (
                      <video
                        key={lesson.videoUrl}
                        src={lesson.videoUrl}
                        controls
                        className="mb-5 aspect-video w-full rounded-lg bg-black"
                      />
                    )
                  ) : null}

                  <div className="prose prose-invert prose-sm max-w-none [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-bold [&_h1]:tracking-tight [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-display [&_h3]:text-sm [&_h3]:font-bold [&_pre]:bg-muted/60 [&_pre]:p-3 [&_pre]:rounded-lg [&_code]:bg-muted/60 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.contentMd}</ReactMarkdown>
                  </div>

                  {lesson.actionItem.trim() ? (
                    <button
                      onClick={toggleActionItem}
                      disabled={progressSaving}
                      className={cn(
                        "mt-6 flex w-full items-start gap-3 rounded-lg border px-4 py-3.5 text-left transition",
                        lessonProgress?.actionItemCompleted
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-border/50 bg-muted/20 hover:border-primary/40",
                      )}
                    >
                      {lessonProgress?.actionItemCompleted ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                      ) : (
                        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      )}
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                          Action item
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 text-sm",
                            lessonProgress?.actionItemCompleted ? "text-emerald-300" : "text-foreground",
                          )}
                        >
                          {lesson.actionItem}
                        </p>
                      </div>
                    </button>
                  ) : null}
                </CardContent>
              </Card>

              {/* ── Completion controls ── */}
              <Card className="border-border/50">
                <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {lessonProgress?.status === "completed" ? (
                      <span className="flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" /> Completed
                      </span>
                    ) : (
                      <Button onClick={markComplete} disabled={progressSaving} className="gap-2">
                        <Check className="h-4 w-4" />
                        {progressSaving ? "Saving…" : "Mark complete"}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {lessonIndex + 1}/{totalLessons}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* ── Prev / next nav ── */}
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={!prevLessonId}
                  onClick={() => prevLessonId && goToLesson(prevLessonId)}
                  className="gap-1.5"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {navigation?.prevLessonTitle ?? "Previous"}
                </Button>
                <Button
                  variant="outline"
                  disabled={!nextLessonId}
                  onClick={() => nextLessonId && goToLesson(nextLessonId)}
                  className="gap-1.5"
                >
                  {navigation?.nextLessonTitle ?? "Next"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
