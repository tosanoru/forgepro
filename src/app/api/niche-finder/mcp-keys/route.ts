import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { mcpApiKeys, workspaces } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { meetsTier } from "@/lib/plan-limits";
import { generateMcpKey } from "@/lib/mcp-auth";

/** GET — the caller's own MCP keys. User-scoped (see schema.ts), so no workspaceId needed to list — just the session. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({ id: mcpApiKeys.id, label: mcpApiKeys.label, keyLast4: mcpApiKeys.keyLast4, lastUsedAt: mcpApiKeys.lastUsedAt, createdAt: mcpApiKeys.createdAt })
    .from(mcpApiKeys)
    .where(eq(mcpApiKeys.userId, session.user.id))
    .orderBy(desc(mcpApiKeys.createdAt));

  return NextResponse.json({ keys: rows });
}

/**
 * POST — generates a new key. Requires workspaceId purely to check that
 * workspace's plan tier (MCP is Pro-only per spec) — the key itself
 * belongs to the user, not that workspace, and works regardless of which
 * workspace happens to be active later.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workspaceId, label } = body as { workspaceId: string; label?: string };
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!meetsTier(workspace?.plan ?? "free", "pro")) {
    return NextResponse.json({ error: "MCP server access requires a Pro plan." }, { status: 403 });
  }

  const { plaintext, hash, last4 } = generateMcpKey();
  const [row] = await db
    .insert(mcpApiKeys)
    .values({ userId: session.user.id, label: label?.trim() || null, keyHash: hash, keyLast4: last4 })
    .returning();

  // The only point in this key's lifetime the plaintext is ever available
  // — not stored, not logged, returned exactly once.
  return NextResponse.json({ key: { id: row.id, label: row.label, plaintext, keyLast4: last4 } }, { status: 201 });
}
