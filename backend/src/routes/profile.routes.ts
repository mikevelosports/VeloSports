import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";

type Role = "player" | "coach" | "parent" | "admin";

interface CreateUserBody {
  email: string;
  password: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

const router = Router();

/**
 * Admin helper: create a new auth user + profile.
 * This is perfect for seeding test users (player/coach/parent/admin).
 */
router.post(
  "/admin/users",
  async (req: Request<unknown, unknown, CreateUserBody>, res: Response, next: NextFunction) => {
    try {
      const { email, password, role, firstName, lastName, phone } = req.body;

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
          phone
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
 * Update profile fields (player/coach/admin).
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
        "birthdate",
        "address_line1",
        "address_line2",
        "city",
        "state_region",
        "postal_code",
        "country",
        "height_cm",
        "weight_kg",
        "playing_level",
        "current_team",
        "jersey_number",
        "photo_url",
        "levels_coached",
        "current_organization",
        "team_logo_url"
      ] as const;

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

      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);


router.get(
  "/profiles",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.query;

      let query = supabaseAdmin
        .from("profiles")
        .select("id, role, email, first_name, last_name")
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
 * Get profile by ID (handy for testing).
 */
router.get(
  "/profiles/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { data: profile, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        throw error;
      }

      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      res.json(profile);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Parent creates a child player (no login).
 * This will:
 * 1) Confirm the parent profile exists and is role "parent"
 * 2) Create a new profile with role "player" and no auth_user_id
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

      // 2) Create child player profile (no auth_user_id, email or password yet)
      const {
        first_name,
        last_name,
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

      const { data: player, error: createPlayerError } = await supabaseAdmin
        .from("profiles")
        .insert({
          role: "player",
          first_name,
          last_name,
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

export default router;
