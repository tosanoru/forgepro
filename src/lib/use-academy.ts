"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export type AcademyLevel = "beginner" | "intermediate" | "advanced";

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  level: AcademyLevel;
  estimatedMinutes: number;
  coverImageUrl: string | null;
  moduleCount: number;
  lessonCount: number;
  enrolled: boolean;
  progress: { completedLessons: number; totalLessons: number; percent: number };
}

export interface LessonSummary {
  id: string;
  moduleId: string;
  title: string;
  lessonNumber: string;
  videoUrl: string | null;
  videoProvider: string | null;
  videoDurationSeconds: number | null;
  actionItem: string;
  estimatedMinutes: number;
  order: number;
  progress: { status: string; actionItemCompleted: boolean; completedAt: string | null } | null;
}

export interface CourseDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  level: AcademyLevel;
  estimatedMinutes: number;
  coverImageUrl: string | null;
  status: string;
  createdAt: string;
}

export interface CourseModule {
  id: string;
  title: string;
  order: number;
  lessons: LessonSummary[];
}

export interface LessonContent {
  lesson: {
    id: string;
    title: string;
    lessonNumber: string;
    contentMd: string;
    videoUrl: string | null;
    videoProvider: string | null;
    videoDurationSeconds: number | null;
    actionItem: string;
    estimatedMinutes: number;
    order: number;
  };
  course: { id: string; slug: string; title: string; level: AcademyLevel };
  module: { id: string; title: string };
  progress: { status: string; actionItemCompleted: boolean; completedAt: string | null } | null;
  navigation: {
    prevLessonId: string | null;
    prevLessonTitle: string | null;
    nextLessonId: string | null;
    nextLessonTitle: string | null;
    lessonIndex: number;
    totalLessons: number;
  };
}

export interface BadgeEarned {
  id: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  courseId: string | null;
  courseTitle: string | null;
  awardedAt: string;
}

/** Access-filtered published course list with progress rings for the current user. */
export function useAcademyCourses() {
  return useSWR<{ courses: CourseSummary[] }>("/api/academy/courses", fetcher);
}

/** Course detail: modules + lesson summaries (no content_md). */
export function useAcademyCourse(slug: string | undefined) {
  return useSWR<{ course: CourseDetail; modules: CourseModule[]; enrolled: boolean }>(
    slug ? `/api/academy/courses/${slug}` : null,
    fetcher,
  );
}

/** Full lesson body for the reading pane. */
export function useAcademyLesson(slug: string | undefined, lessonId: string | undefined) {
  return useSWR<LessonContent>(
    slug && lessonId ? `/api/academy/courses/${slug}/lessons/${lessonId}` : null,
    fetcher,
  );
}

/** Course-level derived progress + continue-where-you-left-off. */
export function useAcademyProgress(slug: string | undefined) {
  return useSWR<{
    course: { id: string; slug: string; title: string };
    progress: { completedLessons: number; totalLessons: number; percent: number };
    modules: { id: string; title: string; order: number; lessonCount: number; completedLessons: number; percent: number }[];
    continueLessonId: string | null;
  }>(slug ? `/api/academy/courses/${slug}/progress` : null, fetcher);
}

/** Badges earned by the current user in the active workspace. */
export function useMyBadges() {
  return useSWR<{ badges: BadgeEarned[] }>("/api/users/me/badges", fetcher);
}

async function patchJson(url: string, { arg }: { arg: unknown }) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

/** Mark lesson progress (in_progress / completed / action item toggle). */
export function useLessonProgress(lessonId: string | undefined) {
  return useSWRMutation(lessonId ? `/api/academy/lessons/${lessonId}/progress` : null, patchJson);
}

/** Enroll in a course (POST verb). */
export async function enrollInCourse(slug: string): Promise<{ enrolled: boolean }> {
  const res = await fetch(`/api/academy/courses/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to enroll");
  return json;
}
