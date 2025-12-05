// backend/src/routes/team.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../config/supabaseClient";

const router = Router();

type TeamMemberRole = "player" | "coach" | "parent";

interface TeamRow {
  id: string;
  owner_profile_id: string;
  name: string;
  age_group: string | null;
  level: string | null;
  organization: string | null;
  info: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamMemberRow {
  id: string;
  team_id: string;
  profile_id: string;
  member_role: TeamMemberRole;
  is_owner: boolean;
  invited_by_profile_id: string | null;
  accepted_at: string | null;
  created_at: string;
}

interface TeamInvitationRow {
  id: string;
  team_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  member_role: TeamMemberRole;
  invite_token: string;
  invited_by_profile_id: string;
  accepted_profile_id: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  created_at: string;
  expires_at: string | null;
}

interface ProfileSummary {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
}

interface TeamMemberDto {
  profileId: string;
  memberRole: TeamMemberRole;
  isOwner: boolean;
  acceptedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  appRole: string | null; // profile.role (player/coach/parent)
}

interface TeamSummaryDto {
  id: string;
  name: string;
  ageGroup: string | null;
  level: string | null;
  organization: string | null;
  info: string | null;
  logoUrl: string | null;
  ownerProfileId: string;
  isOwner: boolean;
  memberRole: TeamMemberRole | null;
}

interface TeamDetailDto extends TeamSummaryDto {
  members: TeamMemberDto[];
  pendingInvitations: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    memberRole: TeamMemberRole;
    status: string;
    createdAt: string;
  }[];
}

const mapTeamRowToSummary = (
  row: TeamRow,
  membership: { isOwner: boolean; memberRole: TeamMemberRole | null }
): TeamSummaryDto => {
  return {
    id: row.id,
    name: row.name,
    ageGroup: row.age_group,
    level: row.level,
    organization: row.organization,
    info: row.info,
    logoUrl: row.logo_url,
    ownerProfileId: row.owner_profile_id,
    isOwner: membership.isOwner,
    memberRole: membership.memberRole
  };
};

/**
 * Helper: ensure a profile exists and is a coach.
 */
async function assertCoachProfile(profileId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", profileId)
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    const err: any = new Error("Profile not found");
    err.status = 404;
    throw err;
  }

  if (data.role !== "coach") {
    const err: any = new Error("Only coach profiles can own teams");
    err.status = 400;
    throw err;
  }
}

/**
 * POST /api/teams
 * Create a new team.
 *
 * Body:
 *  - ownerProfileId (coach)
 *  - name (required)
 *  - ageGroup, level, organization, info, logoUrl (optional)
 */
router.post(
  "/teams",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        ownerProfileId,
        name,
        ageGroup,
        level,
        organization,
        info,
        logoUrl
      } = req.body as {
        ownerProfileId: string;
        name: string;
        ageGroup?: string;
        level?: string;
        organization?: string;
        info?: string;
        logoUrl?: string;
      };

      if (!ownerProfileId || !name) {
        return res.status(400).json({
          error: "ownerProfileId and name are required"
        });
      }

      // Ensure owner is a coach
      await assertCoachProfile(ownerProfileId);

      // Insert team
      const { data: team, error: teamError } = await supabaseAdmin
        .from("teams")
        .insert({
          owner_profile_id: ownerProfileId,
          name,
          age_group: ageGroup ?? null,
          level: level ?? null,
          organization: organization ?? null,
          info: info ?? null,
          logo_url: logoUrl ?? null
        })
        .select("*")
        .single();

      if (teamError) {
        throw teamError;
      }

      const t = team as TeamRow;

      // Insert owner as team member (coach + owner)
      const { error: memberError } = await supabaseAdmin
        .from("team_members")
        .insert({
          team_id: t.id,
          profile_id: ownerProfileId,
          member_role: "coach",
          is_owner: true,
          invited_by_profile_id: ownerProfileId,
          accepted_at: new Date().toISOString()
        });

      if (memberError) {
        throw memberError;
      }

      const dto = mapTeamRowToSummary(t, {
        isOwner: true,
        memberRole: "coach"
      });

      return res.status(201).json(dto);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/profiles/:profileId/teams
 *
 * List all teams that this profile belongs to (including as owner).
 */
router.get(
  "/profiles/:profileId/teams",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { profileId } = req.params;
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }

      // 1) Teams where this profile is the owner
      const { data: ownedTeams, error: ownedError } = await supabaseAdmin
        .from("teams")
        .select("*")
        .eq("owner_profile_id", profileId);

      if (ownedError) throw ownedError;

      const ownedMap = new Map<string, TeamSummaryDto>();
      (ownedTeams ?? []).forEach((row) => {
        const t = row as TeamRow;
        ownedMap.set(
          t.id,
          mapTeamRowToSummary(t, {
            isOwner: true,
            memberRole: "coach"
          })
        );
      });

      // 2) membership rows
      const { data: memberRows, error: memberError } = await supabaseAdmin
        .from("team_members")
        .select("team_id, member_role, is_owner")
        .eq("profile_id", profileId);

      if (memberError) throw memberError;

      const memberTeamIds = Array.from(
        new Set((memberRows ?? []).map((r: any) => r.team_id))
      ).filter((id) => !ownedMap.has(id));

      let memberTeams: TeamRow[] = [];
      if (memberTeamIds.length > 0) {
        const { data, error } = await supabaseAdmin
          .from("teams")
          .select("*")
          .in("id", memberTeamIds);

        if (error) throw error;
        memberTeams = (data ?? []) as TeamRow[];
      }

      const memberDtoMap = new Map<string, TeamSummaryDto>();

      (memberRows ?? []).forEach((r: any) => {
        const teamId = r.team_id as string;
        if (ownedMap.has(teamId)) {
          // Already counted as owner
          return;
        }
        const teamRow = memberTeams.find((t) => t.id === teamId);
        if (!teamRow) return;
        if (!memberDtoMap.has(teamId)) {
          memberDtoMap.set(
            teamId,
            mapTeamRowToSummary(teamRow, {
              isOwner: !!r.is_owner,
              memberRole: r.member_role as TeamMemberRole
            })
          );
        }
      });

      const result: TeamSummaryDto[] = [
        ...ownedMap.values(),
        ...memberDtoMap.values()
      ].sort((a, b) => a.name.localeCompare(b.name));

      return res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Helper: fetch team + ensure profile is a member (or owner).
 * If profileId is provided, enforce access; otherwise just load.
 */
async function loadTeamWithAccessCheck(
  teamId: string,
  profileId?: string
): Promise<TeamRow> {
  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .single();

  if (teamError) throw teamError;
  if (!team) {
    const err: any = new Error("Team not found");
    err.status = 404;
    throw err;
  }
  const t = team as TeamRow;

  if (!profileId) return t;

  if (t.owner_profile_id === profileId) return t;

  const { data: memberRows, error: memberError } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .limit(1);

  if (memberError) throw memberError;

  if (!memberRows || memberRows.length === 0) {
    const err: any = new Error("Not authorized to view this team");
    err.status = 403;
    throw err;
  }

  return t;
}

/**
 * GET /api/teams/:teamId
 *
 * Query param:
 *  - profileId: required for auth checks (must be owner or member).
 */
router.get(
  "/teams/:teamId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teamId } = req.params;
      const profileId = String(req.query.profileId || "");

      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }

      const team = await loadTeamWithAccessCheck(teamId, profileId);

      // Members
      const { data: memberRows, error: membersError } = await supabaseAdmin
        .from("team_members")
        .select("*")
        .eq("team_id", teamId);

      if (membersError) throw membersError;

      const members = (memberRows ?? []) as TeamMemberRow[];
      const profileIds = members.map((m) => m.profile_id);

      let profileMap = new Map<string, ProfileSummary>();
      if (profileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, email, role")
          .in("id", profileIds);

        if (profilesError) throw profilesError;

        profileMap = new Map(
          (profiles ?? []).map((p: any) => [
            p.id as string,
            p as ProfileSummary
          ])
        );
      }

      const memberDtos: TeamMemberDto[] = members.map((m) => {
        const prof = profileMap.get(m.profile_id) ?? ({} as ProfileSummary);
        return {
          profileId: m.profile_id,
          memberRole: m.member_role,
          isOwner: m.is_owner,
          acceptedAt: m.accepted_at,
          firstName: prof.first_name ?? null,
          lastName: prof.last_name ?? null,
          email: prof.email ?? null,
          appRole: prof.role ?? null
        };
      });

      // Pending invitations (for UI later)
      const { data: invitations, error: inviteError } = await supabaseAdmin
        .from("team_invitations")
        .select("*")
        .eq("team_id", teamId)
        .eq("status", "pending");

      if (inviteError) throw inviteError;

      const pendingInvites = (invitations ?? []).map((inv) => {
        const i = inv as TeamInvitationRow;
        return {
          id: i.id,
          email: i.email,
          firstName: i.first_name,
          lastName: i.last_name,
          memberRole: i.member_role,
          status: i.status,
          createdAt: i.created_at
        };
      });

      const dto: TeamDetailDto = {
        ...mapTeamRowToSummary(team, {
          isOwner: team.owner_profile_id === profileId,
          memberRole: null // per-user role not needed in detail; caller already knows
        }),
        members: memberDtos,
        pendingInvitations: pendingInvites
      };

      return res.json(dto);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/teams/:teamId
 *
 * Body:
 *  - requesterProfileId (must be owner)
 *  - optional: name, ageGroup, level, organization, info, logoUrl
 */
router.patch(
  "/teams/:teamId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teamId } = req.params;
      const {
        requesterProfileId,
        name,
        ageGroup,
        level,
        organization,
        info,
        logoUrl
      } = req.body as {
        requesterProfileId: string;
        name?: string;
        ageGroup?: string;
        level?: string;
        organization?: string;
        info?: string;
        logoUrl?: string;
      };

      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }
      if (!requesterProfileId) {
        return res
          .status(400)
          .json({ error: "requesterProfileId is required" });
      }

      const team = await loadTeamWithAccessCheck(teamId, requesterProfileId);

      if (team.owner_profile_id !== requesterProfileId) {
        return res
          .status(403)
          .json({ error: "Only the team owner can update this team" });
      }

      const updatePayload: any = {};
      if (typeof name === "string") updatePayload.name = name;
      if (typeof ageGroup === "string")
        updatePayload.age_group = ageGroup;
      if (typeof level === "string") updatePayload.level = level;
      if (typeof organization === "string")
        updatePayload.organization = organization;
      if (typeof info === "string") updatePayload.info = info;
      if (typeof logoUrl === "string") updatePayload.logo_url = logoUrl;
      updatePayload.updated_at = new Date().toISOString();

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("teams")
        .update(updatePayload)
        .eq("id", teamId)
        .select("*")
        .single();

      if (updateError) throw updateError;
      const t = updated as TeamRow;

      const dto = mapTeamRowToSummary(t, {
        isOwner: true,
        memberRole: "coach"
      });

      return res.json(dto);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/teams/:teamId
 *
 * Body:
 *  - requesterProfileId (must be owner)
 */
router.delete(
  "/teams/:teamId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teamId } = req.params;
      const { requesterProfileId } = req.body as {
        requesterProfileId: string;
      };

      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }
      if (!requesterProfileId) {
        return res
          .status(400)
          .json({ error: "requesterProfileId is required" });
      }

      const team = await loadTeamWithAccessCheck(teamId, requesterProfileId);

      if (team.owner_profile_id !== requesterProfileId) {
        return res
          .status(403)
          .json({ error: "Only the team owner can delete this team" });
      }

      const { error: deleteError } = await supabaseAdmin
        .from("teams")
        .delete()
        .eq("id", teamId);

      if (deleteError) throw deleteError;

      // Cascades to team_members + invitations by FK
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/teams/:teamId/members
 *
 * Body:
 *  - profileId (the member leaving the team)
 *
 * Allows a non-owner member to remove their own membership from a team.
 * We intentionally do NOT touch invitations.
 */
router.delete(
  "/teams/:teamId/members",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teamId } = req.params;
      const { profileId } = req.body as { profileId?: string };

      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }

      // Look up membership for this profile on this team
      const { data: memberRows, error: memberError } = await supabaseAdmin
        .from("team_members")
        .select("id, is_owner")
        .eq("team_id", teamId)
        .eq("profile_id", profileId)
        .limit(1);

      if (memberError) {
        throw memberError;
      }

      const member = (memberRows ?? [])[0] as
        | { id: string; is_owner: boolean }
        | undefined;

      if (!member) {
        return res
          .status(404)
          .json({ error: "You are not a member of this team" });
      }

      if (member.is_owner) {
        // Owner can't just "leave" – they should delete the team or transfer ownership
        return res.status(400).json({
          error:
            "Team owners cannot leave their own team. Use Delete Team instead."
        });
      }

      const { error: deleteError } = await supabaseAdmin
        .from("team_members")
        .delete()
        .eq("id", member.id);

      if (deleteError) {
        throw deleteError;
      }

      // Membership removed
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);


/**
 * POST /api/teams/:teamId/invitations
 *
 * Body:
 *  - requesterProfileId (must be coach on this team)
 *  - email
 *  - memberRole ('player' | 'coach' | 'parent')
 *  - firstName?, lastName?
 *
 * NOTE: This just creates the invite + token. Email sending is a later step.
 */
router.post(
  "/teams/:teamId/invitations",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teamId } = req.params;
      const {
        requesterProfileId,
        email,
        memberRole,
        firstName,
        lastName
      } = req.body as {
        requesterProfileId: string;
        email: string;
        memberRole: TeamMemberRole;
        firstName?: string;
        lastName?: string;
      };

      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }
      if (!requesterProfileId || !email || !memberRole) {
        return res.status(400).json({
          error: "requesterProfileId, email, and memberRole are required"
        });
      }

      // Ensure requester is a coach on the team
      const team = await loadTeamWithAccessCheck(teamId, requesterProfileId);

      const { data: memberRows, error: memberError } = await supabaseAdmin
        .from("team_members")
        .select("member_role")
        .eq("team_id", teamId)
        .eq("profile_id", requesterProfileId)
        .limit(1);

      if (memberError) throw memberError;

      const isOwner = team.owner_profile_id === requesterProfileId;
      const isCoachMember =
        memberRows &&
        memberRows.length > 0 &&
        (memberRows[0] as any).member_role === "coach";

      if (!isOwner && !isCoachMember) {
        return res.status(403).json({
          error:
            "Only coaches on this team can send invitations"
        });
      }

      const token = randomUUID();

      const { data: invite, error: inviteError } = await supabaseAdmin
        .from("team_invitations")
        .insert({
          team_id: teamId,
          email,
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          member_role: memberRole,
          invite_token: token,
          invited_by_profile_id: requesterProfileId
          // status: pending by default
        })
        .select("*")
        .single();

      if (inviteError) throw inviteError;

      const i = invite as TeamInvitationRow;

      return res.status(201).json({
        id: i.id,
        teamId: i.team_id,
        email: i.email,
        firstName: i.first_name,
        lastName: i.last_name,
        memberRole: i.member_role,
        status: i.status,
        inviteToken: i.invite_token,
        createdAt: i.created_at
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/team-invitations/:token/accept
 *
 * Body:
 *  - profileId (the logged-in profile accepting the invite)
 */
router.post(
  "/team-invitations/:token/accept",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params;
      const { profileId } = req.body as { profileId: string };

      if (!token) {
        return res.status(400).json({ error: "token is required" });
      }
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }

      const { data: invite, error: inviteError } = await supabaseAdmin
        .from("team_invitations")
        .select("*")
        .eq("invite_token", token)
        .single();

      if (inviteError) throw inviteError;
      if (!invite) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      const i = invite as TeamInvitationRow;

      if (i.status !== "pending") {
        return res.status(400).json({
          error: `Invitation is not pending (status: ${i.status})`
        });
      }

      if (i.expires_at && new Date(i.expires_at) < new Date()) {
        return res
          .status(400)
          .json({ error: "Invitation has expired" });
      }

      // Add membership (idempotent upsert)
      const { error: memberError } = await supabaseAdmin
        .from("team_members")
        .upsert(
          {
            team_id: i.team_id,
            profile_id: profileId,
            member_role: i.member_role,
            is_owner: false,
            invited_by_profile_id: i.invited_by_profile_id,
            accepted_at: new Date().toISOString()
          },
          {
            onConflict: "team_id,profile_id"
          } as any
        );

      if (memberError) throw memberError;

      // Mark invitation as accepted
      const { data: updatedInvite, error: updateError } =
        await supabaseAdmin
          .from("team_invitations")
          .update({
            status: "accepted",
            accepted_profile_id: profileId
          })
          .eq("id", i.id)
          .select("*")
          .single();

      if (updateError) throw updateError;

      const ui = updatedInvite as TeamInvitationRow;

      return res.json({
        id: ui.id,
        teamId: ui.team_id,
        status: ui.status,
        acceptedProfileId: ui.accepted_profile_id
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
