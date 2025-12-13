// supabase/functions/send-app-email/index.ts
// Deno edge function for sending app emails via Resend.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_BASE_URL =
  Deno.env.get("APP_BASE_URL") ?? "https://app.velosports.com";
const APP_EMAIL_FUNCTION_SECRET =
  Deno.env.get("APP_EMAIL_FUNCTION_SECRET") ?? "";

if (!RESEND_API_KEY) console.warn("[send-app-email] RESEND_API_KEY is not set");
if (!APP_EMAIL_FUNCTION_SECRET) {
  console.warn("[send-app-email] APP_EMAIL_FUNCTION_SECRET is not set");
}

const resend = new Resend(RESEND_API_KEY);

// ---- Payload types ----

type EmailType =
  | "test"
  | "team_invite_existing"
  | "team_invite_new"
  | "parent_link_existing"
  | "support_contact";

interface BasePayload {
  secret: string;
  type: EmailType;
  to: string;
}

interface TestPayload extends BasePayload {
  type: "test";
}

interface TeamInviteExistingPayload extends BasePayload {
  type: "team_invite_existing";
  coachName: string;
  teamName: string;
  inviteUrl: string;
}

interface TeamInviteNewPayload extends BasePayload {
  type: "team_invite_new";
  coachName: string;
  teamName: string;
  inviteUrl: string;
  invitedEmail: string;
}

interface ParentLinkExistingPayload extends BasePayload {
  type: "parent_link_existing";
  parentName: string;
  playerName: string;
  dashboardUrl: string;
}

interface SupportContactPayload extends BasePayload {
  type: "support_contact";
  fromEmail?: string;
  fullName?: string;
  profileId?: string;
  profileRole?: string;
  category?: string;
  message: string;
  source?: string;
}

type SendAppEmailPayload =
  | TestPayload
  | TeamInviteExistingPayload
  | TeamInviteNewPayload
  | ParentLinkExistingPayload
  | SupportContactPayload;

// ---- Helpers ----

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildTeamInviteExistingHtml(p: TeamInviteExistingPayload) {
  const safeCoach = p.coachName || "Your coach";
  const safeTeam = p.teamName || "your team";
  const url = p.inviteUrl || APP_BASE_URL;

  const subject = `${safeCoach} invited you to join ${safeTeam} on Velo`;
  const text = [
    `${safeCoach} has invited you to join "${safeTeam}" in the Velo Sports app.`,
    "",
    "To accept this invite:",
    "1) Sign in to your Velo account",
    "2) Go to My Teams → Team Invites",
    "3) Click Accept",
    "",
    url,
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">Join ${escapeHtml(
        safeTeam
      )} on Velo</h2>
      <p>Hi there,</p>
      <p><strong>${escapeHtml(
        safeCoach
      )}</strong> has invited you to join the team <strong>"${escapeHtml(
    safeTeam
  )}"</strong> in the Velo Sports app.</p>

      <p style="margin-top: 1rem;">
        Click the button below to sign in. After signing in, go to
        <strong>My Teams</strong> → <strong>Team Invites</strong> and click <strong>Accept</strong>.
      </p>

      <p style="margin: 1.25rem 0;">
        <a href="${url}" style="display: inline-block; padding: 0.6rem 1.2rem; border-radius: 999px; background: #22c55e; color: #0f172a; text-decoration: none; font-weight: 600;">
          Sign in to accept the team invite
        </a>
      </p>

      <p style="font-size: 0.9rem; color: #6b7280;">
        If the button doesn&apos;t work, copy and paste this link into your browser:<br />
        <span style="word-break: break-all;">${url}</span>
      </p>

      <p style="margin-top: 1.5rem; font-size: 0.85rem; color: #6b7280;">
        After you accept, you&apos;ll see this team in your <strong>My Teams</strong> list.
      </p>
    </div>
  `;

  return { subject, text, html };
}

function buildTeamInviteNewHtml(p: TeamInviteNewPayload) {
  const safeCoach = p.coachName || "Your coach";
  const safeTeam = p.teamName || "your team";
  const url = p.inviteUrl || APP_BASE_URL;
  const invitedEmail = p.invitedEmail;

  const subject = `${safeCoach} invited you to join ${safeTeam} on Velo`;

  // UPDATED: no auto-accept wording
  const text = [
    `${safeCoach} has invited you to join "${safeTeam}" in the Velo Sports app.`,
    "",
    "To accept this invite, you'll first create your account using this email address:",
    invitedEmail,
    "",
    "Use the link below to get started:",
    url,
    "",
    "After you create your account and sign in:",
    "1) Go to My Teams → Team Invites",
    "2) Click Accept",
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">You&apos;ve been invited to ${escapeHtml(
        safeTeam
      )}</h2>
      <p>Hi there,</p>
      <p><strong>${escapeHtml(
        safeCoach
      )}</strong> has invited you to join the team <strong>"${escapeHtml(
    safeTeam
  )}"</strong> in the Velo Sports app.</p>

      <p style="margin-top: 1rem;">
        Create your account using this email address:
      </p>
      <p style="margin: 0.4rem 0 1rem; font-weight: 600;">${escapeHtml(
        invitedEmail
      )}</p>

      <p>
        After you create your account and sign in, open <strong>My Teams</strong> → <strong>Team Invites</strong> and click <strong>Accept</strong>.
      </p>

      <p style="margin: 1.25rem 0;">
        <a href="${url}" style="display: inline-block; padding: 0.6rem 1.2rem; border-radius: 999px; background: #22c55e; color: #0f172a; text-decoration: none; font-weight: 600;">
          Create account to accept invite
        </a>
      </p>

      <p style="font-size: 0.9rem; color: #6b7280;">
        If the button doesn&apos;t work, copy and paste this link into your browser:<br />
        <span style="word-break: break-all;">${url}</span>
      </p>
    </div>
  `;

  return { subject, text, html };
}

function buildParentLinkExistingHtml(p: ParentLinkExistingPayload) {
  const safeParent = p.parentName || "Your parent";
  const safePlayer = p.playerName || "your player profile";
  const url = p.dashboardUrl || APP_BASE_URL;

  const subject = `${safeParent} is linked to your Velo player profile`;
  const text = [
    `${safeParent} has linked their Velo parent account to ${safePlayer}.`,
    "",
    "This allows them to view training activity, manage sessions, and help monitor progress in the Velo Sports app.",
    "",
    "You can review your account any time here:",
    url,
    "",
    "If you did not expect this link, please contact Velo support.",
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">Parent account linked to your profile</h2>
      <p>Hi there,</p>
      <p>
        <strong>${escapeHtml(
          safeParent
        )}</strong> has linked their <strong>Velo parent account</strong> to
        <strong>${escapeHtml(safePlayer)}</strong>.
      </p>
      <p style="margin-top: 1rem;">
        This allows them to view training activity, manage sessions, and help monitor progress in the Velo Sports app.
      </p>
      <p style="margin: 1.25rem 0;">
        <a href="${url}" style="display: inline-block; padding: 0.6rem 1.2rem; border-radius: 999px; background: #22c55e; color: #0f172a; text-decoration: none; font-weight: 600;">
          Open Velo
        </a>
      </p>
      <p style="font-size: 0.9rem; color: #6b7280;">
        If you did not expect this, please contact Velo support.
      </p>
    </div>
  `;

  return { subject, text, html };
}

function buildSupportContactHtml(p: SupportContactPayload) {
  const safeCategory = p.category || "Unspecified";
  const fromEmail = p.fromEmail || "(no email on file)";
  const fullName = p.fullName || "";
  const profileId = p.profileId || "";
  const profileRole = p.profileRole || "";
  const source = p.source || "profile_page";

  const subject = `[Velo Support] ${safeCategory} issue from ${fromEmail}`;
  const nameLine = fullName ? `${fullName} <${fromEmail}>` : fromEmail;

  const textLines = [
    "New support request from the Velo Sports app.",
    "",
    `From: ${nameLine}`,
    `Category: ${safeCategory}`,
    profileRole ? `Profile role: ${profileRole}` : "",
    profileId ? `Profile ID: ${profileId}` : "",
    source ? `Source: ${source}` : "",
    "",
    "Message:",
    p.message,
  ].filter(Boolean);

  const text = textLines.join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">New Velo support request</h2>
      <p style="margin: 0.35rem 0;"><strong>From:</strong> ${escapeHtml(
        nameLine
      )}</p>
      <p style="margin: 0.2rem 0;"><strong>Category:</strong> ${escapeHtml(
        safeCategory
      )}</p>
      ${
        profileRole || profileId || source
          ? `<p style="margin: 0.2rem 0; font-size: 0.9rem; color: #6b7280;">
              ${profileRole ? `Role: ${escapeHtml(profileRole)}` : ""}
              ${profileRole && profileId ? " · " : ""}
              ${profileId ? `Profile ID: ${escapeHtml(profileId)}` : ""}
              ${(profileRole || profileId) && source ? " · " : ""}
              ${source ? `Source: ${escapeHtml(source)}` : ""}
            </p>`
          : ""
      }
      <div style="margin-top: 1rem; padding: 0.75rem 0.9rem; border-radius: 10px; border: 1px solid #e5e7eb; background: #f9fafb;">
        <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 0.35rem;">
          Issue description
        </div>
        <pre style="margin: 0; white-space: pre-wrap; font-size: 0.9rem; color: #111827;">${escapeHtml(
          p.message
        )}</pre>
      </div>
    </div>
  `;

  return { subject, text, html };
}

// ---- Main handler ----

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: SendAppEmailPayload;
  try {
    payload = (await req.json()) as SendAppEmailPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (!payload?.secret) {
    console.error("[send-app-email] Missing secret in payload");
    return jsonResponse({ error: "Missing secret in body" }, 401);
  }

  if (!APP_EMAIL_FUNCTION_SECRET) {
    console.error("[send-app-email] APP_EMAIL_FUNCTION_SECRET is empty in env");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  if (payload.secret !== APP_EMAIL_FUNCTION_SECRET) {
    console.error("[send-app-email] Secret mismatch");
    return jsonResponse({ error: "Secret mismatch" }, 401);
  }

  if (!payload.to) {
    return jsonResponse({ error: "Missing 'to' email" }, 400);
  }

  try {
    let subject = "Velo Sports";
    let text = "";
    let html = "";
    let replyTo: string | undefined;

    switch (payload.type) {
      case "test": {
        subject = "Velo Sports test email";
        text = [
          "This is a test email from the Velo Sports app.",
          "",
          `APP_BASE_URL: ${APP_BASE_URL}`,
        ].join("\n");
        html = `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a;">
            <h2>Velo Sports test email</h2>
            <p>If you&apos;re reading this, your Supabase email function and Resend configuration are working.</p>
            <p style="font-size: 0.9rem; color: #6b7280;">
              APP_BASE_URL: ${APP_BASE_URL}
            </p>
          </div>
        `;
        break;
      }

      case "team_invite_existing": {
        const built = buildTeamInviteExistingHtml(payload);
        subject = built.subject;
        text = built.text;
        html = built.html;
        break;
      }

      case "team_invite_new": {
        const built = buildTeamInviteNewHtml(payload);
        subject = built.subject;
        text = built.text;
        html = built.html;
        break;
      }

      case "parent_link_existing": {
        const built = buildParentLinkExistingHtml(payload);
        subject = built.subject;
        text = built.text;
        html = built.html;
        break;
      }

      case "support_contact": {
        const p = payload as SupportContactPayload;
        const built = buildSupportContactHtml(p);
        subject = built.subject;
        text = built.text;
        html = built.html;
        replyTo = p.fromEmail;
        break;
      }

      default:
        return jsonResponse({ error: "Unsupported email type" }, 400);
    }

    const { error } = await resend.emails.send({
      from: "Velo Sports <no-reply@velosports.com>",
      to: [payload.to],
      subject,
      text,
      html,
      replyTo,
    });

    if (error) {
      console.error("[send-app-email] Resend error:", error);
      return jsonResponse(
        { error: "Failed to send email", details: String(error) },
        500
      );
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[send-app-email] Unexpected error:", err);
    return jsonResponse(
      { error: "Unexpected error", details: String(err) },
      500
    );
  }
});
