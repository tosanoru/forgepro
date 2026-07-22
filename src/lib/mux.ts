import "server-only";
import Mux from "@mux/mux-node";

/**
 * Thin wrapper, not a full abstraction — Mux's SDK is already a clean API.
 * This just centralizes client construction and the two calls Video Review
 * actually needs: create a direct upload URL, and look one up (used by the
 * webhook handler to resolve an upload back to its DB row).
 */
function client() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error("Missing MUX_TOKEN_ID / MUX_TOKEN_SECRET environment variables.");
  }
  return new Mux({ tokenId, tokenSecret });
}

/**
 * Creates a direct upload — the browser PUTs the video file straight to
 * Mux's storage using the returned URL, never through our own server. Mux
 * transcodes it and fires a webhook (video.asset.ready) when it's playable.
 */
export async function createDirectUpload(corsOrigin: string) {
  const mux = client();
  const upload = await mux.video.uploads.create({
    cors_origin: corsOrigin,
    new_asset_settings: {
      playback_policy: ["public"],
      // "smart" video quality picks encoding tier automatically; fine as a
      // default until there's a reason to tune per-workspace plan tier.
      video_quality: "plus",
    },
  });
  return { uploadId: upload.id, uploadUrl: upload.url };
}

export async function getAsset(assetId: string) {
  const mux = client();
  return mux.video.assets.retrieve(assetId);
}

/**
 * Verifies signature and parses the payload in one call — this is Mux's
 * own documented pattern (mux.webhooks.unwrap), preferred over calling
 * verifySignature() and JSON.parse() separately since it also gives typed
 * access to event.data instead of `any`. Throws on an invalid signature;
 * the webhook route catches that and returns 401.
 */
export async function unwrapWebhookEvent(rawBody: string, headers: Headers) {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing MUX_WEBHOOK_SECRET environment variable.");
  const mux = new Mux({ tokenId: "unused", tokenSecret: "unused" });
  return mux.webhooks.unwrap(rawBody, headers, secret);
}
