import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mcpApiKeys, users } from "@/db/schema";

const KEY_PREFIX = "fmcp_";

/** Generates a new MCP key. Returns the plaintext ONCE — caller must show it to the user immediately; it's never retrievable again. */
export function generateMcpKey(): { plaintext: string; hash: string; last4: string } {
  const plaintext = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  return { plaintext, hash: hashKey(plaintext), last4: plaintext.slice(-4) };
}

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Resolves a presented MCP key (from an `Authorization: Bearer fmcp_...`
 * header) to the user it belongs to. This is the auth path for
 * /api/mcp/niche-finder — MCP clients (Claude Desktop, Cursor) can't do
 * cookie/session auth, so this is deliberately separate from
 * requireRole()/auth() used everywhere else in Forge 2.
 */
export async function resolveMcpKey(plaintext: string | null) {
  if (!plaintext?.startsWith(KEY_PREFIX)) return null;

  const [row] = await db
    .select({ id: mcpApiKeys.id, userId: mcpApiKeys.userId, user: users })
    .from(mcpApiKeys)
    .innerJoin(users, eq(mcpApiKeys.userId, users.id))
    .where(eq(mcpApiKeys.keyHash, hashKey(plaintext)))
    .limit(1);

  if (!row) return null;

  // Fire-and-forget last-used timestamp — not awaited, since this runs on
  // every MCP tool call and shouldn't add latency to the actual response.
  db.update(mcpApiKeys).set({ lastUsedAt: new Date() }).where(eq(mcpApiKeys.id, row.id)).catch(() => {});

  return { userId: row.userId, user: row.user };
}
