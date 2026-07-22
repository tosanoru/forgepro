// ---------------------------------------------------------------------------
// Shared types for the workspace/team foundation.
//
// This is the piece that's genuinely new vs. Forge (the original app this
// was ported from — not to be confused with this app, Forge 2), not a
// port: Forge only ever needed a flat workspace (one team, one flat member
// list). Forge 2 needs to represent five different customer shapes — solo
// creator, agency with sub-clients, production company, church, standalone
// client — with the same primitives. See FORGE-2-ARCHITECTURE.md, section
// 2, for the reasoning behind the recursive model below.
// ---------------------------------------------------------------------------

/**
 * What kind of workspace this is. Drives default branding, which nav
 * sections render, and whether "child workspaces" (clients) are offered
 * as a concept at all.
 *
 * - creator: solo YouTuber/podcaster. No children.
 * - agency: manages N client sub-workspaces (production companies count as
 *   "agency" too — same shape, different marketing name).
 * - client: a child workspace under an agency. Has a parentWorkspaceId.
 * - org: church / non-agency organization. Departments could be modeled as
 *   child workspaces later, but not required to start.
 */
export type WorkspaceType = "creator" | "agency" | "client" | "org";

/**
 * Role hierarchy, broadest to narrowest. Wider than Forge's
 * owner|admin|member because Client Approval requires a role that can see
 * *only* approval-relevant surfaces in a workspace it doesn't otherwise
 * have access to.
 *
 * - owner: full control, billing, can delete the workspace
 * - admin: full control except billing/deletion
 * - editor: can create/edit content, cannot manage members or billing
 * - reviewer: internal, can comment/approve but not edit source content
 * - client_viewer: external. Scoped to a single (usually child) workspace,
 *   sees only what's explicitly shared for approval — never the full
 *   workspace surface.
 */
export type WorkspaceRole = "owner" | "admin" | "editor" | "reviewer" | "client_viewer";

/** Ordered weakest → strongest, used by the permission helper in permissions.ts */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  client_viewer: 0,
  reviewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export interface BrandingConfig {
  logoUrl?: string;
  primaryColor?: string;
  workspaceDisplayName?: string;
  /** White-label: hide "Forge 2" chrome for client-facing surfaces */
  whiteLabel?: boolean;
}

export interface WorkspaceMember {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: WorkspaceRole;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  type: WorkspaceType;
  parentWorkspaceId: string | null;
  ownerId: string;
  branding: BrandingConfig;
  youtubeChannelId: string | null;
  youtubeSubscriberCount: number | null;
  createdAt: string;
}
