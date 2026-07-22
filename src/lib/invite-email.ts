import "server-only";
import { Resend } from "resend";

/**
 * Closes a gap flagged since the first Team pass: invites created a
 * `workspace_invite` row but nothing ever emailed the invitee — they only
 * found out by signing up and having ensureWorkspace() silently claim the
 * pending invite. That's still the fallback if RESEND_API_KEY isn't set
 * (this function just no-ops rather than throwing), but when it is set,
 * the invitee actually gets told.
 */
export async function sendInviteEmail(params: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  appUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromAddress) return; // silent no-op — see comment above; invites still work without this

  const resend = new Resend(apiKey);
  const roleLabel = params.role.replace("_", " ");

  await resend.emails.send({
    from: fromAddress,
    to: params.to,
    subject: `${params.inviterName} invited you to ${params.workspaceName} on Forge 2`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <p style="font-size: 15px; color: #111;">
          <strong>${escapeHtml(params.inviterName)}</strong> invited you to join
          <strong>${escapeHtml(params.workspaceName)}</strong> on Forge 2 as a <strong>${escapeHtml(roleLabel)}</strong>.
        </p>
        <p style="font-size: 15px; color: #111;">
          Sign up (or sign in, if you already have an account) with this email address and you'll be added automatically.
        </p>
        <a href="${params.appUrl}/login" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
          Accept invite
        </a>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
