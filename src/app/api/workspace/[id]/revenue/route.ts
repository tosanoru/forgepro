import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gte, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { revenueEntries } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

/** GET — entries for a workspace, optionally since a date (defaults to last 180 days for the dashboard). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(revenueEntries)
    .where(and(eq(revenueEntries.workspaceId, id), gte(revenueEntries.occurredOn, since)))
    .orderBy(desc(revenueEntries.occurredOn));

  return NextResponse.json({ entries: rows });
}

const InputSchema = z.object({
  source: z.enum(["youtube_adsense", "sponsorship", "other"]), // manual entries only — "stripe" is sync-only, see sync route
  description: z.string().max(300).default(""),
  amountCents: z.number().int(),
  currency: z.string().length(3).default("usd"),
  occurredOn: z.string(), // YYYY-MM-DD
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await requireRole(id, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [row] = await db
    .insert(revenueEntries)
    .values({ workspaceId: id, ...parsed.data, createdBy: session.user.id })
    .returning();

  return NextResponse.json({ entry: row }, { status: 201 });
}
