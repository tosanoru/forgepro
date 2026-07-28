import { pgTable, text, timestamp, primaryKey, integer, jsonb, uniqueIndex, index, boolean, numeric, bigint, date, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { WorkspaceRole, WorkspaceType, BrandingConfig } from "@/lib/workspace-types";
import { THUMBNAIL_COST_ESTIMATE_CENTS } from "@/lib/thumbnail-pricing";

// ---------------------------------------------------------------------------
// Auth tables — ported verbatim from Forge (src/db/schema.ts). No changes;
// Auth.js's Drizzle adapter needs this exact shape.
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("passwordHash"),
  // Platform-level (not per-workspace) admin — see src/lib/super-admin.ts
  // for the bootstrap story: the first super admin is granted via the
  // SUPER_ADMIN_EMAILS env var (since there's a chicken-and-egg problem —
  // no super admin exists yet to grant this flag through the dashboard),
  // and every subsequent grant/revoke happens through /admin, recorded
  // here instead of the env var.
  isSuperAdmin: boolean("isSuperAdmin").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// Workspaces — this is the part that's NEW relative to Forge.
//
// Forge's `workspace` table was flat (one team, no hierarchy). Forge 2
// needs agencies to own client sub-workspaces, so `parentWorkspaceId` is
// self-referential. A solo creator's workspace just never populates it.
// See FORGE-2-ARCHITECTURE.md §2 for why this is one recursive table
// instead of a separate "agency" and "client" schema.
// ---------------------------------------------------------------------------

export const workspaces = pgTable(
  "workspace",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    type: text("type").$type<WorkspaceType>().notNull().default("creator"),
    // Self-referential FK — an agency's client workspaces point back at the
    // agency. Must be a lazy (): AnyPgColumn => ... reference since
    // `workspaces` isn't finished being defined yet at this point.
    parentWorkspaceId: text("parentWorkspaceId").references((): AnyPgColumn => workspaces.id, {
      onDelete: "cascade",
    }),
    ownerId: text("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branding: jsonb("branding").$type<BrandingConfig>().notNull().default({}),
    plan: text("plan").notNull().default("free"),
    // Forge 2's OWN Stripe customer for this workspace's subscription to
    // Forge 2 itself — completely separate from workspace_payment_settings,
    // which stores a workspace's BYOK Stripe/Paystack/Flutterwave key for
    // billing ITS OWN clients. Two unrelated Stripe relationships that
    // happen to share a provider name; see src/lib/platform-billing.ts.
    stripeCustomerId: text("stripeCustomerId"),
    youtubeChannelId: text("youtubeChannelId"),
    youtubeSubscriberCount: integer("youtubeSubscriberCount"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("workspace_parent_idx").on(t.parentWorkspaceId),
    index("workspace_owner_idx").on(t.ownerId),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull().default("editor"),
    joinedAt: timestamp("joinedAt").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspace_member_unique").on(t.workspaceId, t.userId)],
);

export const workspaceInvites = pgTable(
  "workspace_invite",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<WorkspaceRole>().notNull().default("editor"),
    invitedBy: text("invitedBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | accepted
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("workspace_invite_email_idx").on(t.email)],
);

/**
 * Client Approval needs a way to grant a `client_viewer` access to a
 * workspace *without* an account — same reasoning Forge's CLAUDE.md gives
 * for why workspace invites don't require pre-existing signup, taken one
 * step further: approval links are tokenized and don't require signup at
 * all. A row here is a single shareable, revocable link scoped to one
 * workspace (almost always a `client` type workspace).
 */
export const approvalLinks = pgTable(
  "approval_link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Nullable: a link can grant access to a workspace broadly, or (the
    // common case for Video Review) to one specific video. Lazy reference
    // since `videos` is declared further down this file.
    videoId: text("videoId").references((): AnyPgColumn => videos.id, { onDelete: "cascade" }),
    token: text("token")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    label: text("label"), // e.g. "Q3 Promo Video — client review"
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt"),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("approval_link_workspace_idx").on(t.workspaceId), index("approval_link_video_idx").on(t.videoId)],
);

// ---------------------------------------------------------------------------
// AI Script Writing — new module, no Forge equivalent. Forge's BYOK engine
// (src/app/api/seo/route.ts) powered SEO metadata generation with a
// localStorage-only key; the shape is ported into ai-provider.ts, but
// storage moves server-side + encrypted + workspace-scoped. See
// src/lib/crypto.ts.
// ---------------------------------------------------------------------------

/**
 * Workspace-level BYOK AI settings. One row per workspace (not per user) —
 * an agency's whole team shares one provider key, same way Keystone's vault
 * is workspace-scoped rather than per-user. `encryptedApiKey` is opaque
 * ciphertext (see src/lib/crypto.ts) — there is deliberately no plaintext
 * column and no "reveal" API; only `keyLast4` is ever sent to the client,
 * for display like "sk-ant-••••7f2a".
 */
export const workspaceAiSettings = pgTable("workspace_ai_settings", {
  workspaceId: text("workspaceId")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("anthropic"), // anthropic | openai | deepseek | minimax | openrouter | nvidia | kimi | glm | google
  encryptedApiKey: text("encryptedApiKey"), // null = no key saved, falls back to server ANTHROPIC_API_KEY
  keyLast4: text("keyLast4"),
  model: text("model"), // optional override, empty = provider default
  updatedBy: text("updatedBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * AI-generated (and then human-edited) video scripts. One row per script,
 * `content` holds the current draft as plain text/markdown — no versioning
 * yet (see CLAUDE.md gaps list), just latest-write-wins like everything
 * else in this pass.
 */
export const scripts = pgTable(
  "script",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    topic: text("topic").notNull(), // the original brief/prompt used to generate it
    // short | long — determines which system prompt generated this (see
    // src/lib/script-prompts.ts), not just a display label. A short-form
    // script has a genuinely different structure (single hook-payoff loop,
    // no mid-video retention beats, often no spoken CTA), not just a
    // shorter version of the long-form prompt.
    format: text("format").$type<"short" | "long">().notNull().default("long"),
    // Which viral script style was selected at generation time (see
    // src/lib/viral-styles.ts). Null for scripts created before this
    // feature existed. The style influences the system prompt but the
    // script's structure is still format-driven (short vs long).
    scriptStyle: text("scriptStyle"),
    content: text("content").notNull().default(""),
    status: text("status").notNull().default("draft"), // draft | in_review | approved
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [index("script_workspace_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------------------
// Video Review — new module, no Forge equivalent. Ingest/transcode/scrubbing
// is deliberately NOT built here — that's Mux's job (per
// FORGE-2-ARCHITECTURE.md §3). These tables only hold what's genuinely
// ours: the asset reference and the timestamped comment thread layered on
// top of Mux's player.
// ---------------------------------------------------------------------------

export const videos = pgTable(
  "video",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Mux identifiers. uploadId exists as soon as we request a direct
    // upload URL; assetId/playbackId only populate once Mux's webhook
    // reports the asset as ready (see api/mux/webhook/route.ts).
    muxUploadId: text("muxUploadId"),
    muxAssetId: text("muxAssetId"),
    muxPlaybackId: text("muxPlaybackId"),
    durationSeconds: integer("durationSeconds"),
    // Processing lifecycle (Mux side), separate from the human review
    // lifecycle below — a video can be "ready" to watch but still
    // "pending_review", or vice versa never re-enter processing once approved.
    status: text("status").notNull().default("uploading"), // uploading | processing | ready | errored
    reviewStatus: text("reviewStatus").notNull().default("pending_review"), // pending_review | changes_requested | approved
    uploadedBy: text("uploadedBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [index("video_workspace_idx").on(t.workspaceId), index("video_mux_upload_idx").on(t.muxUploadId)],
);

/**
 * Timestamped comments on a video — the Frame.io-style review substrate.
 * `authorId` is set for logged-in team members; `guestName` is set instead
 * for comments left through an unauthenticated approval-link visit (see
 * api/approval/[token]/comments/route.ts) — there's no user row to point
 * `authorId` at in that case.
 */
export const videoComments = pgTable(
  "video_comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    videoId: text("videoId")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }), // denormalized for permission checks without a join
    timestampSeconds: integer("timestampSeconds").notNull(),
    content: text("content").notNull(),
    authorId: text("authorId").references(() => users.id, { onDelete: "set null" }),
    guestName: text("guestName"), // set instead of authorId for approval-link (no-account) comments
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("video_comment_video_idx").on(t.videoId)],
);

// ---------------------------------------------------------------------------
// Content Planning — Kanban pipeline for tracking a video from idea through
// publish. Ported near-verbatim from Forge's pipelineCards (src/db/schema.ts)
// since the shape was already sound: workspace-scoped cards moving through a
// fixed stage sequence, with per-stage completion dates. Two things dropped
// on purpose: youtubeVideoId/youtubeStats (that's Revenue Dashboard's job,
// not Content Planning's — will attach there instead of duplicating here),
// and the SEO fields (title/description/tags), since AI Script Writing
// already owns generated-content editing via the scripts table.
// ---------------------------------------------------------------------------

export const contentCards = pgTable(
  "content_card",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    format: text("format").$type<"short" | "long">().notNull(),
    stage: text("stage")
      .$type<"IDEA" | "SCRIPT" | "PREPRODUCTION" | "PRODUCTION" | "POST_PRODUCTION" | "IN_REVIEW" | "PUBLISHED">()
      .notNull()
      .default("IDEA"),
    notes: text("notes").notNull().default(""), // freeform planning notes — brief, talking points, links
    stageDates: jsonb("stageDates").$type<Record<string, string>>().notNull().default({}),
    dueDate: text("dueDate"), // YYYY-MM-DD
    assigneeId: text("assigneeId").references(() => users.id, { onDelete: "set null" }),
    // Optional link to a generated script (AI Script Writing) or an
    // uploaded video (Video Review) once this card is far enough along —
    // both nullable since a card can exist before either does.
    scriptId: text("scriptId").references((): AnyPgColumn => scripts.id, { onDelete: "set null" }),
    videoId: text("videoId").references((): AnyPgColumn => videos.id, { onDelete: "set null" }),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [index("content_card_workspace_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------------------
// Brand Assets — a lightweight Drive-style asset library. No Forge
// equivalent. Deliberately flat (a `folder` string tag, not a real nested
// folder tree) — most agencies' asset libraries are small enough that
// tag-style filtering beats folder navigation, and a flat model is a lot
// less to build and get wrong. Can graduate to real folders later if a
// workspace's asset count makes that worth it.
// ---------------------------------------------------------------------------

export const brandAssets = pgTable(
  "brand_asset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    folder: text("folder").notNull().default("General"), // flat tag, not a real path
    r2Key: text("r2Key").notNull().unique(), // object key in the R2 bucket
    mimeType: text("mimeType").notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    uploadedBy: text("uploadedBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("brand_asset_workspace_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------------------
// Revenue Dashboard — deliberately does NOT integrate the YouTube Analytics
// Monetary API. That scope (yt-analytics-monetary.readonly) requires a
// Google CASA security assessment before production use — a paid
// third-party audit, not something to build around in code. Forge made the
// same call for its stats feature (src/lib/youtube.ts), staying on the
// public Data API instead of OAuth analytics. So: Stripe (agency billing,
// ordinary API/OAuth, no special verification) + manual entries (for
// AdSense, sponsorships, anything else) is the real v1 scope.
// ---------------------------------------------------------------------------

/** Workspace-level Stripe connection — same BYOK shape as workspace_ai_settings. */
/**
 * Workspace-level payment provider connections — one row per (workspace,
 * provider), so an agency can run Stripe for international clients and
 * Paystack for Nigerian ones at the same time, rather than picking one.
 * Same BYOK shape as workspace_ai_settings: encrypted key, last-4 display
 * only, no reveal path.
 */
export const workspacePaymentSettings = pgTable(
  "workspace_payment_settings",
  {
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"stripe" | "paystack" | "flutterwave">().notNull(),
    encryptedApiKey: text("encryptedApiKey").notNull(),
    keyLast4: text("keyLast4").notNull(),
    connectedBy: text("connectedBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectedAt: timestamp("connectedAt").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.provider] })],
);

/**
 * Kept as a distinct legacy note, not a table: this replaced an earlier
 * single-provider workspace_stripe_settings table from the first Revenue
 * Dashboard pass. If that table exists in a database from before this
 * change, migrate its rows into workspace_payment_settings with
 * provider='stripe' rather than running both schemas side by side.
 */

/**
 * Normalized revenue ledger. Stripe-sourced rows are upserted by
 * externalId (the Stripe charge/balance-transaction id) so re-syncing is
 * idempotent; manual rows have externalId = null.
 */
export const revenueEntries = pgTable(
  "revenue_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    source: text("source").$type<"stripe" | "paystack" | "flutterwave" | "youtube_adsense" | "sponsorship" | "other">().notNull(),
    description: text("description").notNull().default(""),
    amountCents: integer("amountCents").notNull(), // positive = income; kept in cents to avoid float issues
    currency: text("currency").notNull().default("usd"),
    occurredOn: text("occurredOn").notNull(), // YYYY-MM-DD
    externalId: text("externalId"), // Stripe object id for synced rows, null for manual entries
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("revenue_entry_workspace_idx").on(t.workspaceId),
    uniqueIndex("revenue_entry_external_unique").on(t.workspaceId, t.source, t.externalId),
  ],
);

// ---------------------------------------------------------------------------
// Thumbnail Generation — the last module from the original brief. Uses
// OpenAI's image model specifically (gpt-image-1), not the multi-provider
// text engine from AI Script Writing — Anthropic and most of the
// OpenAI-compatible providers in ai-provider.ts don't do image generation
// at all, so this needs its own dedicated key rather than reusing
// workspace_ai_settings. A workspace can use Claude for scripts and still
// need a separate OpenAI key here, and that's expected, not a bug.
// ---------------------------------------------------------------------------

export const workspaceImageSettings = pgTable("workspace_image_settings", {
  workspaceId: text("workspaceId")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  imageProvider: text("imageProvider").notNull().default("openai"), // openai | google | nvidia
  encryptedApiKey: text("encryptedApiKey").notNull(), // encrypted (src/lib/crypto.ts)
  keyLast4: text("keyLast4").notNull(),
  // Null = no budget cap, just the existing monthly count limit from
  // plan-limits. Set by the workspace in Settings → Images; enforced in
  // /api/thumbnails POST alongside (not instead of) the count cap, since
  // count and $ cost aren't the same guardrail — a workspace could want
  // a tighter $ cap than its plan's count limit implies at max quality/size.
  monthlyBudgetCents: integer("monthlyBudgetCents"),
  connectedBy: text("connectedBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  connectedAt: timestamp("connectedAt").notNull().defaultNow(),
});

export const thumbnails = pgTable(
  "thumbnail",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    r2Key: text("r2Key").notNull().unique(), // stored in the same R2 bucket as Brand Assets, different key prefix
    // Estimated OpenAI cost for this generation, in cents — see
    // THUMBNAIL_COST_ESTIMATE_CENTS in image-provider.ts for why this is
    // a fixed estimate rather than the actual billed amount (OpenAI's
    // image API doesn't return per-request cost).
    estimatedCostCents: integer("estimatedCostCents").notNull().default(THUMBNAIL_COST_ESTIMATE_CENTS),
    contentCardId: text("contentCardId").references((): AnyPgColumn => contentCards.id, { onDelete: "set null" }),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("thumbnail_workspace_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------------------
// Niche Finder — from NICHE-FINDER-SPEC.md. Three deliberate adaptations
// from the spec, since it was written before seeing Forge 2's actual code:
//
// 1. IDs: text + crypto.randomUUID(), not pg's uuid() type — matches every
//    other table in this file, not the spec's Drizzle snippet convention.
//
// 2. Scoping: `channels`/`channelSnapshots`/`niches`/`nicheChannels` are
//    intentionally global, not workspace-scoped — this is shared research
//    data every Forge 2 user draws from, not per-tenant content. That part
//    matches the spec as written. `userTrackedChannels` is the one place
//    this deviates: the spec ties it to a bare userId, but every other
//    "list of things a person tracks/owns" in Forge 2 (content cards,
//    scripts, revenue entries) is workspace-scoped so a team shares one
//    view — so tracked channels are workspace-scoped here too, with
//    `trackedBy` for attribution, matching the createdBy/uploadedBy
//    convention used everywhere else. `mcpApiKeys` stays user-scoped as
//    the spec has it: an MCP key configures someone's personal Claude
//    Desktop/Cursor install, which is inherently per-person, not
//    per-workspace, even for someone on a team.
//
// 3. Tiering: the spec says "plug into current Stripe/subscription schema
//    rather than inventing a new one" — but Forge 2 doesn't have one.
//    Stripe/Paystack/Flutterwave here are for a workspace to bill ITS
//    clients, not for Forge 2 to bill workspaces. The existing
//    `workspace.plan` text column (free/lite/pro, unused elsewhere) is
//    reused as the tier gate — see src/lib/plan-limits.ts — but
//    there is no actual payment flow that sets it to anything but "free".
//    That's a real gap, not a subtle one: see CLAUDE.md.
// ---------------------------------------------------------------------------

export const channels = pgTable(
  "channel",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    youtubeChannelId: text("youtubeChannelId").notNull().unique(),
    title: text("title").notNull(),
    handle: text("handle"),
    thumbnailUrl: text("thumbnailUrl"),
    category: text("category"), // mapped niche category, not YouTube's raw category
    isFaceless: boolean("isFaceless").notNull().default(false),
    country: text("country"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("channel_category_idx").on(t.category)],
);

export const channelSnapshots = pgTable(
  "channel_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    channelId: text("channelId")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    subscriberCount: integer("subscriberCount").notNull(),
    viewCount: bigint("viewCount", { mode: "number" }).notNull(),
    videoCount: integer("videoCount").notNull(),
    uploadsLast30d: integer("uploadsLast30d"),
    avgViewsLast10: bigint("avgViewsLast10", { mode: "number" }),
    snapshotDate: date("snapshotDate").notNull(),
  },
  (t) => [
    uniqueIndex("channel_snapshot_daily_unique").on(t.channelId, t.snapshotDate),
    index("channel_snapshot_channel_date_idx").on(t.channelId, t.snapshotDate),
  ],
);

/**
 * The discovery cron's category/keyword list used to be a hardcoded
 * object in discover-channels/route.ts (SEED_KEYWORDS) — fine for a
 * fixed set, but meant adding or tuning a category required a code
 * change and redeploy. Now the source of truth, editable from
 * /admin → Niche Categories. `keywords` and `active` let an admin add a
 * category without touching code, or temporarily pause discovery for one
 * without deleting its history.
 */
export const nicheDiscoveryCategories = pgTable("niche_discovery_category", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  category: text("category").notNull().unique(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * One row per calendar day, incremented atomically on every real YouTube
 * Data API call (see recordYoutubeQuotaUsage in youtube-data.ts) — not
 * per-call rows, since nothing here needs per-call granularity and a
 * day-level counter is both cheaper to query and simpler to reset (it
 * resets itself, a new date is just a new row). Surfaced at
 * /admin → YouTube Quota. This is Forge 2's own estimate of usage, not a
 * value read back from Google — see the same caveat pattern as
 * THUMBNAIL_COST_ESTIMATE_CENTS.
 */
export const youtubeQuotaLog = pgTable(
  "youtube_quota_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: date("date").notNull(),
    units: integer("units").notNull().default(0),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({ uniqDate: uniqueIndex("youtube_quota_log_date_idx").on(t.date) }),
);

/**
 * Per-workspace, per-tool, per-day call counter — currently only used to
 * rate-limit search_videos_by_topic (101 quota units/call, the most
 * expensive MCP tool by far), separate from youtubeQuotaLog above: that
 * table tracks the platform's total quota burn, this tracks one
 * workspace's usage of one specific tool, which is what a per-workspace
 * rate limit actually needs to check.
 */
export const mcpToolUsage = pgTable(
  "mcp_tool_usage",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    date: date("date").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({ uniqWorkspaceToolDate: uniqueIndex("mcp_tool_usage_ws_tool_date_idx").on(t.workspaceId, t.tool, t.date) }),
);

export const niches = pgTable(
  "niche",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    // Unique, not just indexed: v1 assumes one niche per category (see
    // api/cron/niche-finder/discover-channels), and the discovery cron's
    // upsert-on-conflict relies on this being a real constraint, not just
    // an index — onConflictDoNothing() has nothing to target otherwise
    // and would insert a duplicate niche row every week.
    category: text("category").notNull().unique(),
    estimatedRpmLow: numeric("estimatedRpmLow"),
    estimatedRpmHigh: numeric("estimatedRpmHigh"),
    competitionScore: integer("competitionScore"), // 0-100
    growthScore: integer("growthScore"), // 0-100
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [index("niche_growth_score_idx").on(t.growthScore)],
);

export const nicheChannels = pgTable(
  "niche_channel",
  {
    nicheId: text("nicheId")
      .notNull()
      .references(() => niches.id, { onDelete: "cascade" }),
    channelId: text("channelId")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.nicheId, t.channelId] })],
);

/**
 * Workspace-scoped (see note above) — a team's shared tracking list, not
 * one person's. `trackedBy` records who added it, same as `createdBy`
 * elsewhere.
 */
export const userTrackedChannels = pgTable(
  "user_tracked_channel",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channelId: text("channelId")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    trackedBy: text("trackedBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notifyOnGrowthSpike: boolean("notifyOnGrowthSpike").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tracked_channel_workspace_unique").on(t.workspaceId, t.channelId)],
);

/**
 * User-scoped, not workspace-scoped — see note above. `keyHash` only
 * (SHA-256, see src/lib/mcp-auth.ts) — unlike the BYOK provider keys
 * elsewhere in this schema, an MCP key is Forge 2's own credential handed
 * to the user, not a third party's secret we're storing on their behalf,
 * so there's nothing to decrypt back. A hash is enough to verify a
 * presented key; encryption (which implies "we can recover the plaintext")
 * would be the wrong primitive here.
 */
export const mcpApiKeys = pgTable("mcp_api_key", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label"), // e.g. "Claude Desktop", "Cursor"
  keyHash: text("keyHash").notNull().unique(),
  keyLast4: text("keyLast4").notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Script version history — closes a gap flagged since AI Script Writing
// was first built: editing a script overwrote `content` directly,
// latest-write-wins, no way to see or recover what it said before. A
// version row is saved of the PREVIOUS content right before an edit
// overwrites it (see PATCH /api/scripts/[id]) — the current content always
// lives on the `script` row itself, never duplicated into a version row
// until it's about to be replaced.
// ---------------------------------------------------------------------------

export const scriptVersions = pgTable(
  "script_version",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    scriptId: text("scriptId")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    editedBy: text("editedBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("script_version_script_idx").on(t.scriptId)],
);

// ---------------------------------------------------------------------------
// Internal Team Messaging — workspace-scoped conversations between members.
// Conversations auto-create on first message between two or more members.
// No real-time push in v1 (SWR polling covers updates).
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subject: text("subject"),
    createdBy: text("createdBy")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("lastMessageAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("conversation_workspace_idx").on(t.workspaceId),
    index("conversation_last_msg_idx").on(t.lastMessageAt),
  ],
);

export const conversationParticipants = pgTable(
  "conversation_participant",
  {
    conversationId: text("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("lastReadAt"),
    joinedAt: timestamp("joinedAt").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
  ],
);

export const messages = pgTable(
  "message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("senderId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("message_conversation_idx").on(t.conversationId),
  ],
);
