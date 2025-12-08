//backend/src/routes/protocol.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";

const router = Router();

/**
 * List protocols, optionally filter by category or is_assessment.
 */
router.get(
  "/protocols",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, is_assessment } = req.query;

      let query = supabaseAdmin
        .from("protocols")
        .select("*")
        .order("created_at", { ascending: true });

      if (category) {
        query = query.eq("category", String(category));
      }

      if (typeof is_assessment === "string") {
        if (is_assessment === "true") {
          query = query.eq("is_assessment", true);
        } else if (is_assessment === "false") {
          query = query.eq("is_assessment", false);
        }
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
 * Get a single protocol with its steps.
 */
router.get(
  "/protocols/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const { data: protocol, error: protocolError } = await supabaseAdmin
        .from("protocols")
        .select("*")
        .eq("id", id)
        .single();

      if (protocolError) {
        throw protocolError;
      }

      if (!protocol) {
        return res.status(404).json({ error: "Protocol not found" });
      }

      const { data: steps, error: stepsError } = await supabaseAdmin
        .from("protocol_steps")
        .select("*")
        .eq("protocol_id", id)
        .order("step_order", { ascending: true });

      if (stepsError) {
        throw stepsError;
      }

      res.json({
        ...protocol,
        steps: steps ?? []
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
