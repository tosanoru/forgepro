import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { unwrapWebhookEvent } from "@/lib/mux";

/**
 * Mux sends several event types as a video moves through its pipeline; the
 * two that matter here:
 *   video.upload.asset_created — the upload has a Mux asset id now (still processing)
 *   video.asset.ready          — transcoding finished, playback_id is live
 *
 * We look the row up by muxUploadId (set when we created the direct upload
 * in the workspace/[id]/videos route) since that's the only identifier we
 * have before the asset exists.
 *
 * Signature verification + payload parsing goes through mux.webhooks.unwrap()
 * (src/lib/mux.ts) — Mux's own documented pattern, which gives typed
 * event.data access instead of the untyped JSON.parse this used to do.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  let event: Awaited<ReturnType<typeof unwrapWebhookEvent>>;
  try {
    event = await unwrapWebhookEvent(rawBody, req.headers);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  switch (event.type) {
    case "video.upload.asset_created": {
      const uploadId = event.data.id;
      const assetId = event.data.asset_id;
      if (uploadId && assetId) {
        const [existing] = await db
          .select({ status: videos.status })
          .from(videos)
          .where(eq(videos.muxUploadId, uploadId))
          .limit(1);
        if (!existing || existing.status === "ready" || existing.status === "errored") break;
        await db
          .update(videos)
          .set({ muxAssetId: assetId, status: "processing", updatedAt: new Date() })
          .where(eq(videos.muxUploadId, uploadId));
      }
      break;
    }
    case "video.asset.ready": {
      const assetId = event.data.id;
      const uploadId = (event.data as unknown as Record<string, unknown>).source_upload_id as string | undefined;
      const playbackId = event.data.playback_ids?.[0]?.id;
      const duration = event.data.duration ? Math.round(event.data.duration) : null;
      let existing: { id: string; status: string | null } | undefined;
      if (assetId) {
        [existing] = await db
          .select({ id: videos.id, status: videos.status })
          .from(videos)
          .where(eq(videos.muxAssetId, assetId))
          .limit(1);
      }
      if (!existing && uploadId) {
        [existing] = await db
          .select({ id: videos.id, status: videos.status })
          .from(videos)
          .where(eq(videos.muxUploadId, uploadId))
          .limit(1);
      }
      if (!existing || existing.status === "ready" || existing.status === "errored") break;
      await db
        .update(videos)
        .set({
          muxAssetId: assetId ?? undefined,
          muxPlaybackId: playbackId ?? null,
          durationSeconds: duration,
          status: "ready",
          updatedAt: new Date(),
        })
        .where(eq(videos.id, existing.id));
      break;
    }
    case "video.asset.errored": {
      const assetId = event.data.id;
      const uploadId = (event.data as unknown as Record<string, unknown>).source_upload_id as string | undefined;
      let existing: { id: string; status: string | null } | undefined;
      if (assetId) {
        [existing] = await db
          .select({ id: videos.id, status: videos.status })
          .from(videos)
          .where(eq(videos.muxAssetId, assetId))
          .limit(1);
      }
      if (!existing && uploadId) {
        [existing] = await db
          .select({ id: videos.id, status: videos.status })
          .from(videos)
          .where(eq(videos.muxUploadId, uploadId))
          .limit(1);
      }
      if (!existing || existing.status === "ready" || existing.status === "errored") break;
      await db.update(videos).set({ status: "errored", updatedAt: new Date() }).where(eq(videos.id, existing.id));
      break;
    }
    case "video.upload.cancelled": {
      const uploadId = event.data.id;
      if (uploadId) {
        await db.update(videos).set({ status: "errored", updatedAt: new Date() }).where(eq(videos.muxUploadId, uploadId));
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
