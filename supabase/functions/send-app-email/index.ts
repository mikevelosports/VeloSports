// supabase/functions/send-app-email/index.ts
// Deno edge function for sending app emails via Resend.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Resend } from "npm:resend@3.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://app.velosports.com";
const APP_EMAIL_FUNCTION_SECRET = Deno.env.get("APP_EMAIL_FUNCTION_SECRET") ?? "";

if (!RESEND_API_KEY) {
  console.warn("[send-app-email] RESEND_API_KEY is not set");
}
if (!APP_EMAIL_FUNCTION_SECRET) {
  console.warn("[send-app-email] APP_EMAIL_FUNCTION_SECRET is not set");
}

const resend = new Resend(RESEND_API_KEY);

// ---- Payload types ----

type EmailType =
  | "test"
  | "team_invite_existing"
  | "team_invite_new"
  | "parent_link_existing";

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

type SendAppEmailPayload =
  | TestPayload
  | TeamInviteExistingPayload
  | TeamInviteNewPayload
  | ParentLinkExistingPayload;

// ---- Helpers ----

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function buildTeamInviteExistingHtml(p: TeamInviteExistingPayload) {
  const safeCoach = p.coachName || "Your coach";
  const safeTeam = p.teamName || "your team";
  const url = p.inviteUrl || APP_BASE_URL;

  const subject = `${safeCoach} invited you to join ${safeTeam} on Velo`;
  const text = [
    `${safeCoach} has invited you to join "${safeTeam}" in the Velo Sports app.`,
    "",
    "Click the link below to accept your invite. If you don't already have the app open, you'll be asked to sign in first.",
    "",
    url,
    "",
    "After you accept, you'll see this team in your My Teams list and your coach will be able to monitor your progress."
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">Join ${safeTeam} on Velo</h2>
      <p>Hi there,</p>
      <p><strong>${safeCoach}</strong> has invited you to join the team <strong>"${safeTeam}"</strong> in the Velo Sports app.</p>
      <p style="margin-top: 1rem;">
        Click the button below to accept your invite. If you&apos;re not signed in yet, we&apos;ll ask you to sign in first.
      </p>
      <p style="margin: 1.25rem 0;">
        <a href="${url}" style="display: inline-block; padding: 0.6rem 1.2rem; border-radius: 999px; background: #22c55e; color: #0f172a; text-decoration: none; font-weight: 600;">
          Accept team invite
        </a>
      </p>
      <p style="font-size: 0.9rem; color: #6b7280;">
        If the button doesn&apos;t work, copy and paste this link into your browser:<br />
        <span style="word-break: break-all;">${url}</span>
      </p>
      <p style="margin-top: 1.5rem; font-size: 0.85rem; color: #6b7280;">
        After you accept, you&apos;ll see this team in your <strong>My Teams</strong> list and your coach will be able to monitor your progress.
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
  const text = [
    `${safeCoach} has invited you to join "${safeTeam}" in the Velo Sports app.`,
    "",
    "To accept this invite, you'll first create your player account using the email address:",
    invitedEmail,
    "",
    "Use the link below to start:",
    "",
    url,
    "",
    "Once you finish creating your account, you'll be automatically added to the team and your coach will be able to monitor your progress."
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">Create your Velo player account</h2>
      <p>Hi there,</p>
      <p><strong>${safeCoach}</strong> has invited you to join the team <strong>"${safeTeam}"</strong> in the Velo Sports app.</p>
      <p style="margin-top: 1rem;">
        To accept this invite, you&apos;ll first create your Velo player account using this email address:
      </p>
      <p style="margin: 0.4rem 0 1rem; font-weight: 600;">${invitedEmail}</p>
      <p>
        Click the button below to get started. After you complete account creation, you&apos;ll be automatically added to the team.
      </p>
      <p style="margin: 1.25rem 0;">
        <a href="${url}" style="display: inline-block; padding: 0.6rem 1.2rem; border-radius: 999px; background: #22c55e; color: #0f172a; text-decoration: none; font-weight: 600;">
          Create account &amp; join team
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
    "If you did not expect this link, please contact Velo support."
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 0.5rem;">Parent account linked to your profile</h2>
      <p>Hi there,</p>
      <p>
        <strong>${safeParent}</strong> has linked their <strong>Velo parent account</strong> to
        <strong>${safePlayer}</strong>.
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

// ---- Main handler ----

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: SendAppEmailPayload;
  try {
    payload = (await req.json()) as SendAppEmailPayload;
  } catch (_err) {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  // supabase/functions/send-app-email/index.ts

  if (!payload.secret) {
    console.error("[send-app-email] Missing secret in payload", payload);
    return jsonResponse({ error: "Missing secret in body" }, 401);
  }

  if (!APP_EMAIL_FUNCTION_SECRET) {
    console.error("[send-app-email] APP_EMAIL_FUNCTION_SECRET is empty in env");
  }

  if (payload.secret !== APP_EMAIL_FUNCTION_SECRET) {
    console.error("[send-app-email] Secret mismatch", {
      payloadLength: payload.secret.length,
      envLength: APP_EMAIL_FUNCTION_SECRET.length,
      payloadPreview: payload.secret.slice(0, 4),
      envPreview: APP_EMAIL_FUNCTION_SECRET.slice(0, 4)
    });
    return jsonResponse({ error: "Secret mismatch" }, 401);
  }


  if (!payload.secret || payload.secret !== APP_EMAIL_FUNCTION_SECRET) {
    return jsonResponse({ error: "Invalid or missing secret" }, 401);
  }

  if (!payload.to) {
    return jsonResponse({ error: "Missing 'to' email" }, 400);
  }

  try {
    let subject = "Velo Sports";
    let text = "";
    let html = "";

    switch (payload.type) {
      case "test": {
        subject = "Velo Sports test email";
        text = [
          "This is a test email from the Velo Sports app.",
          "",
          `APP_BASE_URL: ${APP_BASE_URL}`
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
        const { subject: s, text: t, html: h } = buildTeamInviteExistingHtml(
          payload
        );
        subject = s;
        text = t;
        html = h;
        break;
      }

      case "team_invite_new": {
        const { subject: s, text: t, html: h } = buildTeamInviteNewHtml(
          payload
        );
        subject = s;
        text = t;
        html = h;
        break;
      }

      case "parent_link_existing": {
        const { subject: s, text: t, html: h } =
          buildParentLinkExistingHtml(payload);
        subject = s;
        text = t;
        html = h;
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
      html
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
