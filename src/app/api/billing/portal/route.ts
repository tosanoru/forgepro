import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireRole, PermissionError } from "@/lib/permissions";
import { createBillingPortalSession } from "@/lib/platform-billing";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { workspaceId } = body as { workspaceId: string };
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const origin = new URL(req.url).origin;

  try {
    const url = await createBillingPortalSession(workspaceId, `${origin}/settings/billing`);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open billing portal";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
