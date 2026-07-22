import "server-only";

/**
 * Extracted from the original inline check in /api/cron/sync-revenue once
 * the Niche Finder pipeline added four more cron routes — five copies of
 * the same three lines was the signal to share it. Returns null if
 * authorized, or a status code + message to return if not.
 */
export function checkCronAuth(req: Request): { status: number; error: string } | null {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return { status: 500, error: "CRON_SECRET is not configured on the server." };
  if (authHeader !== `Bearer ${expected}`) return { status: 401, error: "Unauthorized" };
  return null;
}
