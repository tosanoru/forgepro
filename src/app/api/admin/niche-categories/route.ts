import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { nicheDiscoveryCategories } from "@/db/schema";
import { requireSuperAdmin, SuperAdminError } from "@/lib/super-admin";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof SuperAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const rows = await db.select().from(nicheDiscoveryCategories).orderBy(asc(nicheDiscoveryCategories.category));
  return NextResponse.json({ categories: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof SuperAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { category, keywords } = body as { category?: string; keywords?: string[] };
  if (!category?.trim() || !Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json({ error: "category and a non-empty keywords array are required" }, { status: 400 });
  }
  // Each keyword becomes its own search.list call in the discovery cron
  // (100 units apiece) — capping here keeps one runaway category from
  // silently blowing the daily quota budget the cron's own docs assume.
  if (keywords.length > 5) {
    return NextResponse.json({ error: "Max 5 keywords per category — each one costs 100 quota units/day in the discovery cron." }, { status: 400 });
  }

  const [created] = await db
    .insert(nicheDiscoveryCategories)
    .values({ category: category.trim().toLowerCase(), keywords: keywords.map((k) => k.trim()).filter(Boolean) })
    .onConflictDoNothing()
    .returning();
  if (!created) return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });

  return NextResponse.json({ category: created }, { status: 201 });
}
