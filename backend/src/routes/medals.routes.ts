// backend/src/routes/medals.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";

const router = Router();

/**
 * GET /medals
 * List medal definitions, with optional filters:
 *   ?category=overspeed
 *   ?age_group=youth
 *   ?badge_tier=gold
 *   ?active=true|false
 */
router.get(
  "/medals",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, age_group, badge_tier, active } = req.query;

      let query = supabaseAdmin
        .from("medals")
        .select("*")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("badge_tier", { ascending: true })
        .order("badge_name", { ascending: true });

      if (category) {
        query = query.eq("category", String(category));
      }
      if (age_group) {
        query = query.eq("age_group", String(age_group));
      }
      if (badge_tier) {
        query = query.eq("badge_tier", String(badge_tier));
      }
      if (typeof active === "string") {
        if (active === "true") query = query.eq("is_active", true);
        if (active === "false") query = query.eq("is_active", false);
      }

      const { data, error } = await query;
      if (error) throw error;

      res.json(data ?? []);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /players/:playerId/medals
 *
 * Returns:
 * {
 *   medals: Medal[];          // all active medals (definitions)
 *   earned: PlayerMedal[];    // rows from player_medals for that player
 * }
 *
 * UI can join on medal_id to know which medals are earned.
 */
router.get(
  "/players/:playerId/medals",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;

      // 1) All active medals (definitions)
      const { data: medals, error: medalsError } = await supabaseAdmin
        .from("medals")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("badge_tier", { ascending: true })
        .order("badge_name", { ascending: true });

      if (medalsError) throw medalsError;

      // 2) Earned medals for this player
      const { data: earned, error: earnedError } = await supabaseAdmin
        .from("player_medals")
        .select("*")
        .eq("player_id", playerId);

      if (earnedError) throw earnedError;

      res.json({
        medals: medals ?? [],
        earned: earned ?? []
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
