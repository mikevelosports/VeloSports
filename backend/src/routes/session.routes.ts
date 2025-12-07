// backend/src/routes/session.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabaseClient";
import { updatePlayerProgramStateForSession } from "./programState.routes";
import { awardMedalsForPlayerEvents } from "./medals.routes";

const router = Router();

interface CreateSessionBody {
  player_id: string;
  protocol_id: string;
  created_by_profile_id: string;
  notes?: string;
}

interface SessionEntryInput {
  protocol_step_id: string;
  attempt_index?: number;
  value_number?: number;
  value_text?: string;
  side?: string;
}

interface AddSessionEntriesBody {
  entries: SessionEntryInput[];
}

/**
 * Start a session for a player and protocol.
 */
router.post(
  "/sessions",
  async (
    req: Request<unknown, unknown, CreateSessionBody>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { player_id, protocol_id, created_by_profile_id, notes } =
        req.body;

      if (!player_id || !protocol_id || !created_by_profile_id) {
        return res.status(400).json({
          error:
            "player_id, protocol_id and created_by_profile_id are required"
        });
      }

      // Ensure player exists and is role 'player'
      const { data: player, error: playerError } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", player_id)
        .single();

      if (playerError) {
        throw playerError;
      }

      if (!player || player.role !== "player") {
        return res.status(400).json({
          error: "player_id must refer to a profile with role 'player'"
        });
      }

      // Get creator role
      const { data: creator, error: creatorError } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", created_by_profile_id)
        .single();

      if (creatorError) {
        throw creatorError;
      }

      if (!creator) {
        return res
          .status(400)
          .json({ error: "created_by_profile_id not found" });
      }

      // Check protocol exists
      const { data: protocol, error: protocolError } = await supabaseAdmin
        .from("protocols")
        .select("id")
        .eq("id", protocol_id)
        .single();

      if (protocolError) {
        throw protocolError;
      }

      if (!protocol) {
        return res
          .status(400)
          .json({ error: "protocol_id not found" });
      }

      const { data: session, error: sessionError } = await supabaseAdmin
        .from("sessions")
        .insert({
          player_id,
          protocol_id,
          created_by_profile_id,
          created_by_role: creator.role,
          notes
        })
        .select("*")
        .single();

      if (sessionError) {
        throw sessionError;
      }

      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Add entries to a session.
 */
router.post(
  "/sessions/:sessionId/entries",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const { entries } = req.body as AddSessionEntriesBody;

      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({
          error: "entries array is required and cannot be empty"
        });
      }

      // Confirm session exists
      const { data: session, error: sessionError } = await supabaseAdmin
        .from("sessions")
        .select("id")
        .eq("id", sessionId)
        .single();

      if (sessionError) {
        throw sessionError;
      }

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const rowsToInsert = entries.map((e) => ({
        session_id: sessionId,
        protocol_step_id: e.protocol_step_id,
        attempt_index: e.attempt_index ?? 1,
        value_number: e.value_number ?? null,
        value_text: e.value_text ?? null,
        side: e.side ?? null
      }));

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("session_entries")
        .insert(rowsToInsert)
        .select("*");

      if (insertError) {
        throw insertError;
      }

      res.status(201).json(inserted);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Mark a session as completed.
 */
router.post(
  "/sessions/:sessionId/complete",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const { notes } = req.body as { notes?: string };

      const update: Record<string, any> = {
        status: "completed",
        completed_at: new Date().toISOString()
      };

      if (typeof notes === "string") {
        update.notes = notes;
      }

      const { data: session, error } = await supabaseAdmin
        .from("sessions")
        .update(update)
        .eq("id", sessionId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Best-effort update of program state; don't break the response if this fails
      try {
        await updatePlayerProgramStateForSession(sessionId);
      } catch (stateErr) {
        console.error(
          "[sessions] Failed to update player_program_state for session",
          sessionId,
          stateErr
        );
      }

      // Best-effort medal awarding for this completed session
      let newlyAwarded: any[] = [];
      try {
        const { data: protocol, error: protocolError } =
          await supabaseAdmin
            .from("protocols")
            .select("id, title, category, is_assessment")
            .eq("id", session.protocol_id)
            .single();

        if (protocolError) {
          throw protocolError;
        }

        const category = (protocol?.category || "").toLowerCase();
        const isAssessment = !!protocol?.is_assessment;

        const eventCodes: string[] = ["session_completed"];

        if (category) {
          eventCodes.push(`session_completed:${category}`);
        }
        if (isAssessment) {
          eventCodes.push("session_completed:assessment");
        }

        const medalResult = await awardMedalsForPlayerEvents({
          playerId: session.player_id,
          eventCodes,
          source: "session_completed",
          context: {
            session_id: session.id,
            protocol_id: protocol?.id ?? null,
            protocol_title: protocol?.title ?? null,
            category
          }
        });

        newlyAwarded = medalResult?.newlyAwarded ?? [];
      } catch (medalErr) {
        console.error(
          "[sessions] Failed to award medals for completed session",
          sessionId,
          medalErr
        );
      }

      res.json({
        session,
        newly_awarded_medals: newlyAwarded
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Get a session with its entries.
 */
router.get(
  "/sessions/:sessionId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;

      const { data: session, error: sessionError } = await supabaseAdmin
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessionError) {
        throw sessionError;
      }

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const { data: entries, error: entriesError } = await supabaseAdmin
        .from("session_entries")
        .select("*")
        .eq("session_id", sessionId)
        .order("recorded_at", { ascending: true });

      if (entriesError) {
        throw entriesError;
      }

      res.json({
        ...session,
        entries: entries ?? []
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * List sessions for a given player.
 */
router.get(
  "/players/:playerId/sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId } = req.params;
      const { status, limit } = req.query as {
        status?: string;
        limit?: string;
      };

      if (!playerId) {
        return res.status(400).json({ error: "playerId is required" });
      }

      let query = supabaseAdmin
        .from("sessions")
        .select("*")
        .eq("player_id", playerId);

      // Optional status filter, e.g. status=completed
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const limitNumber =
        typeof limit === "string" && !Number.isNaN(Number(limit))
          ? Math.max(1, Math.min(500, parseInt(limit, 10)))
          : 200;

      // Prefer ordering by completed_at (most recent completed first),
      // then by started_at as a fallback.
      query = query
        .order("completed_at", { ascending: false, nullsFirst: false })
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(limitNumber);

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


export default router;
