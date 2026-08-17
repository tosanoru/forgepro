/**
 * Academy seed — parses a source course markdown and inserts it as
 * course / modules / lessons / badge rows. Generic on purpose: any future
 * course that follows the same conventions (a `# MODULE N — TITLE` header
 * per module, a `## N.N Title` header per lesson ending in a
 * `**Do This Now:**` line) can be dropped into scripts/courses/ and seeded
 * with the same script.
 *
 * Idempotent: re-running deletes the course by slug first (cascades to
 * modules, lessons, progress, enrollments, access, and the linked badge),
 * then re-inserts. Safe to run at any time.
 *
 * Run: npm run db:seed:academy
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { desc, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL is required (npm run db:seed:academy loads .env.local)");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql, { schema });

const MODULE_HEADER = /^# MODULE (\d+) — (.+)$/;
const LESSON_HEADER = /^## (\d+\.\d+) (.+)$/;
const ACTION_ITEM = /^\*\*Do This Now:\*\*\s*(.+)$/;
const SEPARATOR = /^---$/;

interface ParsedModule {
  title: string;
  order: number;
  lessons: ParsedLesson[];
}

interface ParsedLesson {
  lessonNumber: string;
  title: string;
  contentMd: string;
  actionItem: string;
  order: number;
  estimatedMinutes: number;
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function estimateMinutes(bodyWords: number): number {
  // Heuristic: roughly 25 words of dense instructional text per minute,
  // clamped to a 10–45 minute range so the totals stay sensible against
  // the source course's stated 10–14 hour estimate.
  return Math.max(10, Math.min(45, Math.round(bodyWords / 25)));
}

function parseCourseMarkdown(markdown: string): {
  title: string;
  description: string;
  modules: ParsedModule[];
} {
  const lines = markdown.split("\n");
  const title = (lines[0] ?? "").replace(/^#\s+/, "").trim();
  const subtitle = (lines[1] ?? "").replace(/^###\s+/, "").trim();

  const modules: ParsedModule[] = [];
  let currentModule: ParsedModule | null = null;
  let currentLesson: ParsedLesson | null = null;
  const bodyLines: string[] = [];

  const flushLesson = () => {
    if (!currentLesson) return;
    const body = bodyLines.join("\n").trim();
    const doThisNow = body.match(ACTION_ITEM);
    currentLesson.contentMd = doThisNow
      ? body.replace(doThisNow[0], "").trim()
      : body;
    currentLesson.actionItem = doThisNow?.[1]?.trim() ?? "";
    currentLesson.estimatedMinutes = estimateMinutes(body.split(/\s+/).filter(Boolean).length);
    currentModule?.lessons.push(currentLesson);
    currentLesson = null;
    bodyLines.length = 0;
  };

  for (const line of lines) {
    const moduleMatch = line.match(MODULE_HEADER);
    if (moduleMatch) {
      flushLesson();
      currentModule = {
        title: titleCase(moduleMatch[2]),
        order: Number(moduleMatch[1]),
        lessons: [],
      };
      modules.push(currentModule);
      continue;
    }

    const lessonMatch = line.match(LESSON_HEADER);
    if (lessonMatch) {
      if (!currentModule) {
        throw new Error(
          `Lesson "${lessonMatch[2]}" appears before any "# MODULE" header — the source file's structure isn't what the parser expects.`,
        );
      }
      flushLesson();
      currentLesson = {
        lessonNumber: lessonMatch[1],
        title: lessonMatch[2],
        contentMd: "",
        actionItem: "",
        order: currentModule.lessons.length + 1,
        estimatedMinutes: 0,
      };
      continue;
    }

    if (SEPARATOR.test(line)) continue;

    if (currentLesson) bodyLines.push(line);
  }
  flushLesson();

  return { title, description: subtitle, modules };
}

async function main() {
  console.log("Seeding Academy…\n");

  // A course must be linked to a real author (createdBy FK -> users).
  const [author] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .limit(1);
  if (!author) {
    console.error("✗ No users found — create/sign in a user before seeding the Academy.");
    process.exit(1);
  }

  const { readFile } = await import("node:fs/promises");
  const markdown = await readFile("scripts/courses/content-production-fundamentals.md", "utf8");
  const parsed = parseCourseMarkdown(markdown);

  if (!parsed.modules.length || !parsed.modules.some((m) => m.lessons.length)) {
    console.error("✗ Parsed no modules/lessons — check the source markdown structure.");
    process.exit(1);
  }

  const slug = "content-production-fundamentals";

  // Idempotent: wipe any previous seed of this course (cascades down).
  const [existing] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.slug, slug))
    .limit(1);
  if (existing) {
    await db.delete(schema.courses).where(eq(schema.courses.id, existing.id));
    console.log(`  ↺ Removed previous "${slug}" seed`);
  }

  const totalMinutes = parsed.modules.reduce(
    (sum, m) => sum + m.lessons.reduce((s, l) => s + l.estimatedMinutes, 0),
    0,
  );

  const [course] = await db
    .insert(schema.courses)
    .values({
      slug,
      title: parsed.title,
      description: parsed.description,
      level: "beginner",
      estimatedMinutes: totalMinutes,
      status: "published",
      createdBy: author.id,
    })
    .returning();
  console.log(`  ✓ Course: ${parsed.title} (~${Math.round(totalMinutes / 60)}h total)`);

  let lessonCount = 0;
  for (const modData of parsed.modules) {
    const [mod] = await db
      .insert(schema.modules)
      .values({ courseId: course.id, title: modData.title, order: modData.order })
      .returning();
    for (const lesson of modData.lessons) {
      await db.insert(schema.lessons).values({
        moduleId: mod.id,
        title: lesson.title,
        lessonNumber: lesson.lessonNumber,
        contentMd: lesson.contentMd,
        actionItem: lesson.actionItem,
        estimatedMinutes: lesson.estimatedMinutes,
        order: lesson.order,
        videoUrl: null,
      });
      lessonCount++;
    }
    console.log(`  ✓ Module ${modData.order}: ${modData.title} (${modData.lessons.length} lessons)`);
  }

  await db.insert(schema.badges).values({
    slug: "content-production-fundamentals-complete",
    title: "Production Fundamentals",
    description: "Completed Content Production Fundamentals — pre-production through export.",
    courseId: course.id,
  });
  console.log("  ✓ Badge: content-production-fundamentals-complete");

  console.log(`\nDone! ${parsed.modules.length} modules, ${lessonCount} lessons, 1 badge.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
