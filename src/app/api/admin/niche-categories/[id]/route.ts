import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { nicheDiscoveryCategories } from "@/db/schema";
import { requireSuperAdmin, SuperAdminError } from "@/lib/super-admin";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof SuperAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  const body = await req.json();
  const { keywords, active } = body as { keywords?: string[]; active?: boolean };

  const updates: Partial<typeof nicheDiscoveryCategories.$inferInsert> = { updatedAt: new Date() };
  if (keywords !== undefined) {
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: "keywords must be a non-empty array" }, { status: 400 });
    }
    if (keywords.length > 5) {
      return NextResponse.json({ error: "Max 5 keywords per category — each one costs 100 quota units/day in the discovery cron." }, { status: 400 });
    }
    updates.keywords = keywords.map((k) => k.trim()).filter(Boolean);
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
    updates.active = active;
  }

  const [updated] = await db.update(nicheDiscoveryCategories).set(updates).where(eq(nicheDiscoveryCategories.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  return NextResponse.json({ category: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof SuperAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  // Deleting the category row doesn't touch the niche/channels already
  // discovered under it (niches.category is just a string, not an FK to
  // this table) — it only stops future discovery runs from searching for
  // it. Existing data stays intact, same as flipping `active` off but
  // permanent.
  await db.delete(nicheDiscoveryCategories).where(eq(nicheDiscoveryCategories.id, id));
  return NextResponse.json({ status: "deleted" });
}
