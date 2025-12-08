// backend/src/routes/profile.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";
import { awardMedalsForPlayerEvents } from "./medals.routes";

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
 * Get full profile by ID.
 */
router.get(
  "/profiles/:id",
  async (req: Request, res: Response, next: NextFunction) => {
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
 * For now this:
 *  - Finds the player by email
 *  - Ensures they are role "player"
 *  - Creates player_parent_links if not already present
 *  - TODO: send an email for confirmation
 */
router.post(
  "/parents/:parentId/invite-player",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { parentId } = req.params;
      const { email } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Confirm parent
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("profiles")
        .select("id, role, first_name, last_name")
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

      // Find player profile by email
      const {
        data: player,
        error: playerError,
        status: playerStatus
      } = await supabaseAdmin
        .from("profiles")
        .select(
          "id, role, email, first_name, last_name, auth_user_id, photo_url, playing_level, current_team"
        )
        .eq("email", normalizedEmail)
        .eq("role", "player")
        .single();

      if (playerError && playerStatus !== 406) {
        throw playerError;
      }

      if (!player) {
        return res
          .status(404)
          .json({ error: "No player found with that email" });
      }

      if (!player.auth_user_id) {
        return res.status(400).json({
          error:
            "That player does not have a login yet. Use 'Add Player' instead for parent-managed accounts."
        });
      }

      // Check if already linked
      const { data: existingLinks, error: existingError } =
        await supabaseAdmin
          .from("player_parent_links")
          .select("player_id")
          .eq("parent_id", parentId)
          .eq("player_id", player.id);

      if (existingError) {
        throw existingError;
      }

      if (!existingLinks || existingLinks.length === 0) {
        const { error: linkError } = await supabaseAdmin
          .from("player_parent_links")
          .insert({
            parent_id: parentId,
            player_id: player.id
          });

        if (linkError) {
          throw linkError;
        }
      }

      // TODO: send real email invite
      console.log(
        `[parent-invite] Parent ${parentId} invited player ${player.id} (${player.email})`
      );

      return res.json({
        message:
          "Invite recorded. In a production environment this would send an email for confirmation.",
        player
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
