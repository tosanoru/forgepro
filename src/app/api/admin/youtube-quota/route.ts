import { NextResponse } from "next/server";
import { gte } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { youtubeQuotaLog } from "@/db/schema";
import { requireSuperAdmin, SuperAdminError } from "@/lib/super-admin";

// Google's default per-project daily allotment — see the discover-channels
// cron's own comment for the budget math this is checked against.
export const YOUTUBE_DAILY_QUOTA_BUDGET = 10_000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof SuperAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.select().from(youtubeQuotaLog).where(gte(youtubeQuotaLog.date, since)).orderBy(youtubeQuotaLog.date);

  const today = new Date().toISOString().slice(0, 10);
  const todayUsage = rows.find((r) => r.date === today)?.units ?? 0;

  return NextResponse.json({
    budget: YOUTUBE_DAILY_QUOTA_BUDGET,
    todayUsage,
    todayPercent: Math.round((todayUsage / YOUTUBE_DAILY_QUOTA_BUDGET) * 100),
    history: rows,
  });
}
