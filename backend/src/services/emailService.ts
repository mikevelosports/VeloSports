// backend/src/services/emailService.ts
import { supabaseAdmin } from "../config/supabaseClient";
import { ENV } from "../config/env";

type TeamInviteEmailKind = "existing" | "new";

interface SendTeamInviteEmailArgs {
  kind: TeamInviteEmailKind;
  to: string;
  coachName: string;
  teamName: string;
  inviteUrl: string;
  invitedEmailForNew?: string;
}

export async function sendTeamInviteEmail(
  args: SendTeamInviteEmailArgs
): Promise<void> {
  const type =
    args.kind === "existing"
      ? "team_invite_existing"
      : "team_invite_new";

  try {
    const { error } = await supabaseAdmin.functions.invoke(
      "send-app-email",
      {
        body: {
          secret: ENV.appEmailFunctionSecret,
          type,
          to: args.to,
          coachName: args.coachName,
          teamName: args.teamName,
          inviteUrl: args.inviteUrl,
          invitedEmail: args.invitedEmailForNew
        }
      }
    );

    if (error) {
      console.error("[emailService] Failed to send team invite email", {
        to: args.to,
        error
      });
    }
  } catch (err) {
    console.error(
      "[emailService] Unexpected error while sending team invite email",
      err
    );
  }
}

interface SendParentLinkExistingArgs {
  to: string;
  parentName: string;
  playerName: string;
  dashboardUrl?: string;
}

export async function sendParentLinkExistingEmail(
  args: SendParentLinkExistingArgs
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.functions.invoke(
      "send-app-email",
      {
        body: {
          secret: ENV.appEmailFunctionSecret,
          type: "parent_link_existing",
          to: args.to,
          parentName: args.parentName,
          playerName: args.playerName,
          dashboardUrl: args.dashboardUrl ?? ENV.appBaseUrl
        }
      }
    );

    if (error) {
      console.error(
        "[emailService] Failed to send parent link email",
        { to: args.to, error }
      );
    }
  } catch (err) {
    console.error(
      "[emailService] Unexpected error while sending parent link email",
      err
    );
  }
}

// Simple test helper – used by the debug route below
export async function sendTestEmail(to: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.functions.invoke(
      "send-app-email",
      {
        body: {
          secret: ENV.appEmailFunctionSecret,
          type: "test",
          to
        }
      }
    );

    if (error) {
      console.error("[emailService] Failed to send test email", {
        to,
        error
      });
      throw error;
    }
  } catch (err) {
    console.error(
      "[emailService] Unexpected error while sending test email",
      err
    );
    throw err;
  }
}


interface SendSupportContactEmailArgs {
  fromEmail: string | null;
  fullName: string | null;
  profileId: string | null;
  profileRole: string | null;
  category: string;
  message: string;
  source?: string;
}

export async function sendSupportContactEmail(
  args: SendSupportContactEmailArgs
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.functions.invoke(
      "send-app-email",
      {
        body: {
          secret: ENV.appEmailFunctionSecret,
          type: "support_contact",
          to: "app@velosports.com",
          fromEmail: args.fromEmail ?? undefined,
          fullName: args.fullName ?? undefined,
          profileId: args.profileId ?? undefined,
          profileRole: args.profileRole ?? undefined,
          category: args.category,
          message: args.message,
          source: args.source ?? undefined
        }
      }
    );

    if (error) {
      console.error(
        "[emailService] Failed to send support contact email",
        {
          from: args.fromEmail,
          error
        }
      );
    }
  } catch (err) {
    console.error(
      "[emailService] Unexpected error while sending support contact email",
      err
    );
  }
}
