/**
 * Name of the cookie that tracks which workspace a person currently has
 * selected in the Sidebar switcher. httpOnly + sameSite=lax: not readable
 * by client JS (no reason for it to be — the UI gets the active workspace
 * back from GET /api/workspace, not by reading this cookie itself) and
 * sent on normal navigation, not cross-site requests.
 *
 * Deliberately NOT stored in the Auth.js session/JWT — that would mean
 * every workspace switch re-issues a session token, and the session
 * shouldn't need to change just because someone's browsing a different
 * workspace. A plain cookie is the right weight for this.
 */
export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";
