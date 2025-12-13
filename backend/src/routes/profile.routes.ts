// backend/src/routes/profile.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";
import { awardMedalsForPlayerEvents } from "./medals.routes";
import { ENV } from "../config/env";
import {
  sendParentLinkInviteEmail,
  sendSupportContactEmail
} from "../services/emailService";
import { randomUUID } from "crypto";



type Role = "player" | "coach" | "parent" | "admin";

interface CreateUserBody {
  email: string;
  password: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthdate?: string; // ISO YYYY-MM-DD (optional for admin seeding)
}

interface SignupBody {
  email: string;
  password: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthdate?: string; // ISO YYYY-MM-DD
}

interface SupportContactBody {
  category?: string;
  message?: string;
  profileId?: string;
  source?: string;
}

interface ParentLinkInvitationRow {
  id: string;
  parent_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  invite_token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  accepted_player_id: string | null;
  created_at: string;
  expires_at: string | null;
}


const UNDER_13_MESSAGE =
  "Account for players under the age of 13 must be created by a parent through a parent account. Have your parent create an account and then create your account from inside the app.";

const calculateAgeFromBirthdate = (birthdateIso: string): number => {
  if (!birthdateIso) return 0;
  const parts = birthdateIso.split("-");
  if (parts.length !== 3) return 0;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day) return 0;

  const today = new Date();
  const birth = new Date(year, month - 1, day);

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

const router = Router();

/**
 * Public signup: create a new auth user + profile.
 * Enforces:
 *  - role must be player/coach/parent
 *  - player accounts < 13 cannot be created directly
 */
// backend/src/routes/profile.routes.ts

router.post(
  "/signup",
  async (
    req: Request<unknown, unknown, SignupBody>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { email, password, role, firstName, lastName, phone, birthdate } =
        req.body;

      if (!email || !password || !role) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "email, password and role are required"
        });
      }

      if (!["player", "coach", "parent"].includes(role)) {
        return res.status(400).json({
          error: "INVALID_ROLE",
          message: "Role must be player, coach or parent for self-signup"
        });
      }

      let birthdateIso: string | null = null;
      if (typeof birthdate === "string" && birthdate.trim() !== "") {
        birthdateIso = birthdate.trim();
      }

      if (role === "player") {
        if (!birthdateIso) {
          return res.status(400).json({
            error: "BIRTHDATE_REQUIRED",
            message: "Birthdate is required for player accounts."
          });
        }

        const age = calculateAgeFromBirthdate(birthdateIso);
        if (age < 13) {
          return res.status(400).json({
            error: "UNDER_13_PLAYER",
            message: UNDER_13_MESSAGE
          });
        }
      }

      // 🔁 NEW: use auth.signUp instead of auth.admin.createUser
      // This will send a confirmation email if "Confirm email" is enabled
      const { data: signUpData, error: signUpError } =
        await supabaseAdmin.auth.signUp({
          email,
          password,
          options: {
            // extra metadata if you ever want triggers to use it
            data: {
              role,
              first_name: firstName,
              last_name: lastName,
              phone,
              birthdate: birthdateIso
            },
            // Where Supabase should redirect after the confirmation link is clicked
            emailRedirectTo: `${ENV.appBaseUrl}/login`
          }
        });

      if (signUpError || !signUpData?.user) {
        throw signUpError ?? new Error("Failed to create auth user");
      }

      const authUser = signUpData.user;

      // 2) Insert into profiles (same as before)
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          auth_user_id: authUser.id,
          role,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          birthdate: birthdateIso
        })
        .select("*")
        .single();

      if (profileError) {
        throw profileError;
      }

      return res.status(201).json({
        authUserId: authUser.id,
        profile
      });
    } catch (err) {
      next(err);
    }
  }
);


/**
 * Admin helper: create a new auth user + profile.
 * This is perfect for seeding test users (player/coach/parent/admin).
 */
router.post(
  "/admin/users",
  async (
    req: Request<unknown, unknown, CreateUserBody>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { email, password, role, firstName, lastName, phone, birthdate } =
        req.body;

      if (!email || !password || !role) {
        return res
          .status(400)
          .json({ error: "email, password and role are required" });
      }

      if (!["player", "coach", "parent", "admin"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      // 1) Create Supabase Auth user
      const { data: createUserData, error: createUserError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true
        });

      if (createUserError || !createUserData?.user) {
        throw createUserError ?? new Error("Failed to create auth user");
      }

      const authUser = createUserData.user;

      // 2) Insert into profiles
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          auth_user_id: authUser.id,
          role,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          birthdate: birthdate ?? null
        })
        .select("*")
        .single();

      if (profileError) {
        throw profileError;
      }

      return res.status(201).json({
        authUserId: authUser.id,
        profile
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Get the current user's profile based on Supabase JWT.
 * Expects Authorization: Bearer <access_token>
 */
router.get(
  "/me",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;

      if (!token) {
        return res.status(401).json({
          error: "NO_TOKEN",
          message: "Missing Authorization header"
        });
      }

      // Validate the JWT and get the auth user from Supabase
      const { data: userData, error: userError } =
        await supabaseAdmin.auth.getUser(token);

      if (userError || !userData?.user) {
        return res.status(401).json({
          error: "INVALID_TOKEN",
          message: "Invalid Supabase token"
        });
      }

      const authUserId = userData.user.id;

      // Look up the profile mapped to this auth user
      const {
        data: profile,
        error: profileError,
        status
      } = await supabaseAdmin
        .from("profiles")
        .select("id, role, email, first_name, last_name, birthdate")
        .eq("auth_user_id", authUserId)
        .single();

      if (profileError && status !== 406) {
        throw profileError;
      }

      if (!profile) {
        return res.status(404).json({
          error: "PROFILE_NOT_FOUND",
          message: "Profile not found for this auth user"
        });
      }

      return res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Delete the current user's account.
 * - Validates Supabase JWT (Authorization: Bearer <access_token>)
 * - Finds the profile by auth_user_id
 * - Soft-deletes + scrubs the profile
 * - Attempts to delete the Supabase Auth user
 */
router.delete(
  "/me",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;

      if (!token) {
        return res.status(401).json({
          error: "NO_TOKEN",
          message: "Missing Authorization header"
        });
      }

      // 1) Validate the JWT and get the auth user from Supabase
      const { data: userData, error: userError } =
        await supabaseAdmin.auth.getUser(token);

      if (userError || !userData?.user) {
        return res.status(401).json({
          error: "INVALID_TOKEN",
          message: "Invalid Supabase token"
        });
      }

      const authUserId = userData.user.id;

      // 2) Find the associated profile
      const {
        data: profile,
        error: profileError,
        status
      } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("auth_user_id", authUserId)
        .single();

      if (profileError && status !== 406) {
        console.error("[DELETE /me] Error fetching profile", profileError);
        return res.status(500).json({
          error: "PROFILE_LOOKUP_FAILED",
          message: profileError.message
        });
      }

      const nowIso = new Date().toISOString();

      if (profile) {
        // 3) Soft‑delete + scrub profile row
        // ⚠️ Only set nullable fields to null. Leave non-null fields like `role`, `softball`,
        // `created_at`, etc. as-is to avoid constraint errors.
        const scrubPayload: Record<string, any> = {
          email: null,
          first_name: null,
          last_name: null,
          phone: null,
          address_line1: null,
          address_line2: null,
          city: null,
          state_region: null,
          postal_code: null,
          country: null,
          birthdate: null,
          height_cm: null,
          weight_kg: null,
          playing_level: null,
          current_team: null,
          current_team_level: null,
          current_coach_name: null,
          current_coach_email: null,
          jersey_number: null,
          positions_played: null,
          years_played: null,
          batting_avg_last_season: null,
          photo_url: null,
          levels_coached: null,
          current_organization: null,
          team_logo_url: null,
          bio: null,
          // keep role + softball, just mark as incomplete and deleted
          profile_complete: false,
          is_deleted: true,
          deleted_at: nowIso,
          deleted_reason: "user_request",
          updated_at: nowIso
        };

        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update(scrubPayload)
          .eq("id", profile.id);

        if (updateError) {
          console.error("[DELETE /me] Error scrubbing profile", updateError);
          return res.status(500).json({
            error: "PROFILE_DELETE_FAILED",
            message: updateError.message
          });
        }
      }

      // 4) Best‑effort delete of Supabase Auth user
      try {
        const { error: deleteError } =
          await supabaseAdmin.auth.admin.deleteUser(authUserId);

        if (deleteError) {
          console.error(
            "[DELETE /me] Failed to delete auth user",
            authUserId,
            deleteError
          );
          // We STILL return 204 here, because the profile is already scrubbed and
          // RLS hides it from normal users.
        }
      } catch (err) {
        console.error(
          "[DELETE /me] Unexpected error deleting auth user",
          authUserId,
          err
        );
      }

      // No content – the client should sign out & redirect
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Get full profile by ID.
 */
router.get(
  "/profiles/:id",
    async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const { data, error, status } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (error && status !== 406) {
        console.error("Error fetching profile:", error);
        return res
          .status(500)
          .json({ error: "Failed to fetch profile", details: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: "Profile not found" });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("Unexpected error fetching profile:", err);
      return res
        .status(500)
        .json({ error: "Unexpected error fetching profile" });
    }
  }
);

/**
 * Update profile fields (player/coach/admin/parent).
 * Body uses snake_case to match DB columns.
 */
router.put(
  "/profiles/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Allowed updatable fields
      const allowedFields = [
        "first_name",
        "last_name",
        "phone",
        "address_line1",
        "address_line2",
        "city",
        "state_region",
        "postal_code",
        "country",
        "birthdate",
        "height_cm",
        "weight_kg",
        "playing_level",
        "current_team",
        "current_team_level",
        "current_coach_name",
        "current_coach_email",
        "jersey_number",
        "positions_played",
        "years_played",
        "batting_avg_last_season",
        "photo_url",
        "levels_coached",
        "current_organization",
        "team_logo_url",
        "bio",
        "softball",
        "profile_complete" // ✅ allow updating profile_complete
      ];

      const payload: Record<string, any> = {};
      for (const field of allowedFields) {
        if (field in req.body) {
          payload[field] = (req.body as any)[field];
        }
      }

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: "No valid fields provided" });
      }

      payload.updated_at = new Date().toISOString();

      const { data: profile, error } = await supabaseAdmin
        .from("profiles")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // ✅ Best-effort medal awarding for completed player profiles
      try {
        if (
          profile.role === "player" &&
          (profile as any).profile_complete === true
        ) {
          await awardMedalsForPlayerEvents({
            playerId: profile.id,
            eventCodes: ["profile_completed"],
            source: "profile_completed",
            context: { profile_id: profile.id }
          });
        }
      } catch (medalErr) {
        console.error(
          "[profiles] Failed to award medals for profile completion",
          profile.id,
          medalErr
        );
      }

      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * List profiles (lightweight summary).
 */
router.get(
  "/profiles",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.query;

      let query = supabaseAdmin
        .from("profiles")
        .select("id, role, email, first_name, last_name, birthdate")
        .order("created_at", { ascending: true });

      if (typeof role === "string" && role.length > 0) {
        query = query.eq("role", role);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      res.json(data ?? []);
    } catch (err) {
      next(err);
    }
  }
);


router.post(
  "/support/contact",
  async (
    req: Request<unknown, unknown, SupportContactBody>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;

      if (!token) {
        return res.status(401).json({
          error: "NO_TOKEN",
          message: "Missing Authorization header"
        });
      }

      const { data: userData, error: userError } =
        await supabaseAdmin.auth.getUser(token);

      if (userError || !userData?.user) {
        return res.status(401).json({
          error: "INVALID_TOKEN",
          message: "Invalid Supabase token"
        });
      }

      const authUser = userData.user;
      const { category, message, profileId, source } = req.body;

      if (!message || typeof message !== "string" || message.trim().length < 5) {
        return res.status(400).json({
          error: "MESSAGE_REQUIRED",
          message:
            "Please provide a short description of the issue so we can help."
        });
      }

      const trimmedCategory =
        typeof category === "string" && category.trim()
          ? category.trim()
          : "Unspecified";

      // Try to look up the profile the message is about
      let profileRow: any = null;

      if (profileId) {
        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, role, email, first_name, last_name")
          .eq("id", profileId)
          .single();

        if (!error && data) {
          profileRow = data;
        }
      }

      if (!profileRow) {
        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, role, email, first_name, last_name")
          .eq("auth_user_id", authUser.id)
          .single();

        if (!error && data) {
          profileRow = data;
        }
      }

      const profileEmail =
        profileRow?.email ??
        authUser.email ??
        (authUser.user_metadata as any)?.email ??
        null;

      const fullName =
        `${profileRow?.first_name ?? ""} ${
          profileRow?.last_name ?? ""
        }`.trim() ||
        (authUser.user_metadata as any)?.full_name ||
        authUser.email ||
        null;

      await sendSupportContactEmail({
        fromEmail: profileEmail,
        fullName,
        profileId: profileRow?.id ?? profileId ?? null,
        profileRole: profileRow?.role ?? null,
        category: trimmedCategory,
        message: message.trim(),
        source: source ?? "profile_page"
      });

      return res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Parent creates a child player (no login yet).
 * This will:
 * 1) Confirm the parent profile exists and is role "parent"
 * 2) Create a new profile with role "player" (auth_user_id null)
 * 3) Link them in player_parent_links
 */
router.post(
  "/parents/:parentId/players",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { parentId } = req.params;

      // 1) Check parent
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", parentId)
        .single();

      if (parentError) {
        throw parentError;
      }

      if (!parent || parent.role !== "parent") {
        return res
          .status(400)
          .json({ error: "Parent not found or role is not 'parent'" });
      }

      // 2) Create child player profile
      const {
        first_name,
        last_name,
        email,
        birthdate,
        address_line1,
        address_line2,
        city,
        state_region,
        postal_code,
        country,
        height_cm,
        weight_kg,
        playing_level,
        current_team,
        jersey_number,
        photo_url
      } = req.body;

      if (!first_name || !last_name) {
        return res
          .status(400)
          .json({ error: "first_name and last_name are required" });
      }

      // Parent UI can generate dummy emails, but we also guard here.
      let finalEmail: string | null =
        typeof email === "string" && email.trim() !== ""
          ? email.trim().toLowerCase()
          : null;

      if (!finalEmail) {
        const baseName = `${first_name ?? ""}${last_name ?? ""}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "");
        const rand = Math.random().toString(36).slice(2, 10);
        const safeBase = baseName || "player";
        finalEmail = `${safeBase}-${rand}@baseballpop.com`;
      }

      const { data: player, error: createPlayerError } = await supabaseAdmin
        .from("profiles")
        .insert({
          role: "player",
          first_name,
          last_name,
          email: finalEmail,
          birthdate,
          address_line1,
          address_line2,
          city,
          state_region,
          postal_code,
          country,
          height_cm,
          weight_kg,
          playing_level,
          current_team,
          jersey_number,
          photo_url
        })
        .select("*")
        .single();

      if (createPlayerError) {
        throw createPlayerError;
      }

      // 3) Link parent ↔ player
      const { error: linkError } = await supabaseAdmin
        .from("player_parent_links")
        .insert({
          player_id: player.id,
          parent_id: parent.id
        });

      if (linkError) {
        throw linkError;
      }

      res.status(201).json(player);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Get all child player profiles for a parent.
 */
router.get(
  "/parents/:parentId/players",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { parentId } = req.params;

      // Optional: ensure parent exists & is parent
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", parentId)
        .single();

      if (parentError) {
        throw parentError;
      }

      if (!parent || parent.role !== "parent") {
        return res
          .status(400)
          .json({ error: "Parent not found or role is not 'parent'" });
      }

      const { data: links, error: linksError } = await supabaseAdmin
        .from("player_parent_links")
        .select("player_id")
        .eq("parent_id", parentId);

      if (linksError) {
        throw linksError;
      }

      if (!links || links.length === 0) {
        return res.json([]);
      }

      const playerIds = links.map((l: any) => l.player_id).filter(Boolean);

      if (playerIds.length === 0) {
        return res.json([]);
      }

      const { data: players, error: playersError } = await supabaseAdmin
        .from("profiles")
        .select(
          "id, role, email, first_name, last_name, photo_url, playing_level, current_team"
        )
        .in("id", playerIds);

      if (playersError) {
        throw playersError;
      }

      res.json(players ?? []);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Unlink (but do not delete) a child player from a parent.
 */
router.delete(
  "/parents/:parentId/players/:playerId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { parentId, playerId } = req.params;

      const { error } = await supabaseAdmin
        .from("player_parent_links")
        .delete()
        .eq("parent_id", parentId)
        .eq("player_id", playerId);

      if (error) {
        throw error;
      }

      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Parent invites an existing player (with an Auth account) to link.
 * This will:
 *  - Find the player by email
 *  - Ensure they are role "player" and have auth_user_id
 *  - Create player_parent_links if not already present
 *  - Send an email letting the player know a parent account is linked
 */
router.post(
  "/parents/:parentId/invite-player",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { parentId } = req.params;
      const { email, first_name, last_name } = req.body as {
        email?: string;
        first_name?: string;
        last_name?: string;
      };

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Confirm parent
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("profiles")
        .select("id, role, first_name, last_name, email")
        .eq("id", parentId)
        .single();

      if (parentError) throw parentError;

      if (!parent || parent.role !== "parent") {
        return res
          .status(400)
          .json({ error: "Parent not found or role is not 'parent'" });
      }

      const parentName =
        `${parent.first_name ?? ""} ${parent.last_name ?? ""}`.trim() ||
        parent.email ||
        "A parent";

      // See if this email belongs to an existing player w/ auth
      let hasExistingAuthUser = false;
      try {
        const { data: profiles, error } = await supabaseAdmin
          .from("profiles")
          .select("id, auth_user_id, role")
          .eq("email", normalizedEmail)
          .eq("role", "player");

        if (error) throw error;
        hasExistingAuthUser = !!(profiles ?? []).find((p: any) => p.auth_user_id);
      } catch (e) {
        console.warn("[parent-link] failed auth-user lookup", e);
      }

      // Reuse existing pending invite if present (prevents spam/duplicates)
      const { data: existing } = await supabaseAdmin
        .from("parent_link_invitations")
        .select("*")
        .eq("parent_id", parentId)
        .eq("email", normalizedEmail)
        .eq("status", "pending")
        .maybeSingle();

      let inviteRow: ParentLinkInvitationRow;

      if (existing) {
        inviteRow = existing as ParentLinkInvitationRow;
      } else {
        const token = randomUUID();
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

        const { data: created, error: createErr } = await supabaseAdmin
          .from("parent_link_invitations")
          .insert({
            parent_id: parentId,
            email: normalizedEmail,
            first_name: first_name ?? null,
            last_name: last_name ?? null,
            invite_token: token,
            expires_at: expiresAt
          })
          .select("*")
          .single();

        if (createErr) throw createErr;
        inviteRow = created as ParentLinkInvitationRow;
      }

      // Email: tell player to log in and accept in-dashboard (NOT auto accept)
      const inviteTokenParam = encodeURIComponent(inviteRow.invite_token);
      const emailParam = encodeURIComponent(normalizedEmail);

      const loginUrlExisting = `${ENV.appBaseUrl}/login?email=${emailParam}&parentInviteToken=${inviteTokenParam}`;
      const loginUrlNew = `${ENV.appBaseUrl}/login?mode=signup&email=${emailParam}&parentInviteToken=${inviteTokenParam}`;

      // ✅ You will implement this email helper (see section C below)
      void sendParentLinkInviteEmail({
        kind: hasExistingAuthUser ? "existing" : "new",
        to: normalizedEmail,
        parentName,
        inviteUrl: hasExistingAuthUser ? loginUrlExisting : loginUrlNew
      });

      return res.json({
        message:
          "Invite sent. The player must accept the parent link from their dashboard.",
        invitation: {
          id: inviteRow.id,
          email: inviteRow.email,
          firstName: inviteRow.first_name,
          lastName: inviteRow.last_name,
          status: inviteRow.status,
          inviteToken: inviteRow.invite_token,
          createdAt: inviteRow.created_at,
          expiresAt: inviteRow.expires_at
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/profiles/:profileId/parent-link-invitations",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { profileId } = req.params;
      const status = String(req.query.status || "pending").toLowerCase();

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, email, role, first_name, last_name")
        .eq("id", profileId)
        .single();

      if (profileError) throw profileError;
      if (!profile || profile.role !== "player") return res.json([]);

      const email = String(profile.email || "").trim().toLowerCase();
      if (!email) return res.json([]);

      let query = supabaseAdmin
        .from("parent_link_invitations")
        .select("*")
        .eq("email", email);

      if (status !== "all") query = query.eq("status", status);

      const { data: invites, error } = await query;
      if (error) throw error;

      const now = new Date();

      const pendingValid = (invites ?? []).filter((i: any) => {
        if (i.status !== "pending") return false;
        if (!i.expires_at) return true;
        const exp = new Date(i.expires_at);
        return !Number.isNaN(exp.getTime()) && exp > now;
      });

      // Load parent names for display
      const parentIds = Array.from(new Set(pendingValid.map((i: any) => i.parent_id)));
      let parentMap = new Map<string, any>();
      if (parentIds.length) {
        const { data: parents, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", parentIds);
        if (pErr) throw pErr;
        parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]));
      }

      return res.json(
        pendingValid.map((i: any) => {
          const parent = parentMap.get(i.parent_id);
          const parentName =
            `${parent?.first_name ?? ""} ${parent?.last_name ?? ""}`.trim() ||
            parent?.email ||
            "Parent";

          return {
            id: i.id,
            parentId: i.parent_id,
            parentName,
            parentEmail: parent?.email ?? null,
            email: i.email,
            firstName: i.first_name ?? null,
            lastName: i.last_name ?? null,
            status: i.status,
            inviteToken: i.invite_token,
            createdAt: i.created_at,
            expiresAt: i.expires_at ?? null
          };
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/parent-link-invitations/:token/accept",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params;
      const { profileId } = req.body as { profileId?: string };

      if (!token) return res.status(400).json({ error: "token is required" });
      if (!profileId) return res.status(400).json({ error: "profileId is required" });

      const { data: invite, error: invErr } = await supabaseAdmin
        .from("parent_link_invitations")
        .select("*")
        .eq("invite_token", token)
        .single();

      if (invErr) throw invErr;
      if (!invite) return res.status(404).json({ error: "Invitation not found" });

      if (invite.status !== "pending") {
        return res.status(400).json({ error: `Invitation is not pending (status: ${invite.status})` });
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: "Invitation has expired" });
      }

      const { data: acceptor, error: accErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role, email")
        .eq("id", profileId)
        .single();

      if (accErr) throw accErr;
      if (!acceptor || acceptor.role !== "player") {
        return res.status(400).json({ error: "Only player accounts can accept parent link invites" });
      }

      const acceptorEmail = String(acceptor.email || "").trim().toLowerCase();
      const inviteEmail = String(invite.email || "").trim().toLowerCase();

      if (!acceptorEmail || acceptorEmail !== inviteEmail) {
        return res.status(403).json({
          error: "This invite was sent to a different email. Sign in with the invited email."
        });
      }

      // Create link (idempotent if you added the unique constraint)
      const { error: linkErr } = await supabaseAdmin
        .from("player_parent_links")
        .upsert(
          { parent_id: invite.parent_id, player_id: acceptor.id },
          { onConflict: "parent_id,player_id" } as any
        );

      if (linkErr) throw linkErr;

      // Mark accepted
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("parent_link_invitations")
        .update({ status: "accepted", accepted_player_id: acceptor.id })
        .eq("id", invite.id)
        .select("*")
        .single();

      if (updErr) throw updErr;

      return res.json({
        id: updated.id,
        status: updated.status,
        parentId: updated.parent_id,
        playerId: acceptor.id
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/parents/:parentId/parent-link-invitations",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { parentId } = req.params;

      const { data: parent, error: parentError } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", parentId)
        .single();

      if (parentError) throw parentError;
      if (!parent || parent.role !== "parent") return res.status(400).json({ error: "Invalid parent" });

      const { data: invites, error } = await supabaseAdmin
        .from("parent_link_invitations")
        .select("*")
        .eq("parent_id", parentId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return res.json(
        (invites ?? []).map((i: any) => ({
          id: i.id,
          email: i.email,
          firstName: i.first_name ?? null,
          lastName: i.last_name ?? null,
          status: i.status,
          inviteToken: i.invite_token,
          createdAt: i.created_at,
          expiresAt: i.expires_at ?? null
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/parent-link-invitations/:invitationId/resend",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { invitationId } = req.params;
      const { requesterProfileId } = req.body as { requesterProfileId?: string };

      if (!requesterProfileId) {
        return res.status(400).json({ error: "requesterProfileId is required" });
      }

      const { data: invite, error: invErr } = await supabaseAdmin
        .from("parent_link_invitations")
        .select("*")
        .eq("id", invitationId)
        .single();

      if (invErr) throw invErr;
      if (!invite) return res.status(404).json({ error: "Invitation not found" });

      if (invite.parent_id !== requesterProfileId) {
        return res.status(403).json({ error: "Not authorized to resend this invite" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ error: `Invite not pending (status: ${invite.status})` });
      }

      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: "Invitation has expired" });
      }

      // Load parent display name
      const { data: parent } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", requesterProfileId)
        .single();

      const parentName =
        `${parent?.first_name ?? ""} ${parent?.last_name ?? ""}`.trim() ||
        parent?.email ||
        "A parent";

      // Check if invited email has existing auth user
      let hasExistingAuthUser = false;
      try {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("auth_user_id, role")
          .eq("email", invite.email)
          .eq("role", "player");
        hasExistingAuthUser = !!(profiles ?? []).find((p: any) => p.auth_user_id);
      } catch {}

      const inviteTokenParam = encodeURIComponent(invite.invite_token);
      const emailParam = encodeURIComponent(invite.email);

      const loginUrlExisting = `${ENV.appBaseUrl}/login?email=${emailParam}&parentInviteToken=${inviteTokenParam}`;
      const loginUrlNew = `${ENV.appBaseUrl}/login?mode=signup&email=${emailParam}&parentInviteToken=${inviteTokenParam}`;

      void sendParentLinkInviteEmail({
        kind: hasExistingAuthUser ? "existing" : "new",
        to: invite.email,
        parentName,
        inviteUrl: hasExistingAuthUser ? loginUrlExisting : loginUrlNew
      });

      return res.json({ ok: true, message: "Invite resent" });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/players/:playerId/parents",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;

      const { data: links, error: linksErr } = await supabaseAdmin
        .from("player_parent_links")
        .select("parent_id")
        .eq("player_id", playerId);

      if (linksErr) throw linksErr;

      const parentIds = (links ?? []).map((l: any) => l.parent_id).filter(Boolean);
      if (!parentIds.length) return res.json([]);

      const { data: parents, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email, role")
        .in("id", parentIds);

      if (pErr) throw pErr;

      return res.json(
        (parents ?? []).map((p: any) => ({
          id: p.id,
          firstName: p.first_name ?? null,
          lastName: p.last_name ?? null,
          email: p.email ?? null
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);


export default router;
