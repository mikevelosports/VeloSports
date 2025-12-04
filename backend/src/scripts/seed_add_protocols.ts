// backend/src/scripts/seed_add_protocols.ts
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabaseClient";

/**
 * Raw row shape from add_protocols.xlsx
 */
interface RawRow {
  [key: string]: any;
  "Protocol Category"?: string | null;
  "Protocol Level"?: string | null;
  protocol_name?: string | null;
  velo_config?: string | null;
  "Drill 1"?: string | null;
  Drills?: string | null;
  drill_description?: string | null;
  type?: string | null;
  reps?: number | string | null;
  data?: string | null;
}

interface ProtocolDef {
  id: string;
  protocolName: string; // normalized slug
  title: string;
  category: string;
  isAssessment: boolean;
}

interface StepDef {
  id: string;
  protocol_id: string;
  step_order: number;
  title: string;
  instructions: string | null;
  metric_key: string | null;
  metric_label: string | null;
  unit: string | null;
  is_required: boolean;
  target_reps: number | null;
  velo_config: string | null;
  swing_type: string | null;
  data_capture: string | null;
}

/**
 * Category normalizer
 * - Power Mechanics Ground Force -> power_mechanics (already in sheet)
 * - Exit Velo Application -> exit_velo_application (fix typo)
 */
function normalizeCategory(
  cat: string | null | undefined
): string | null {
  if (!cat) return null;
  const val = cat.trim().toLowerCase();

  if (val === "overspeed") return "overspeed";
  if (val === "counterweight") return "counterweight";
  if (val === "warm-up" || val === "warm_up" || val === "warm up") {
    return "warm_up";
  }
  if (val === "power_mechanics" || val === "power_mechancis") {
    return "power_mechanics";
  }
  if (val === "assessments" || val === "assessment") {
    return "assessments";
  }

  // New: Exit Velo Application category (typo + correct)
  if (
    val === "exit_velo_applicatoin" ||
    val === "exit_velo_application" ||
    val === "exit velo application"
  ) {
    return "exit_velo_application";
  }

  return val;
}

/**
 * Normalize protocol_name to a clean slug
 * - Lowercase
 * - Spaces -> underscores
 * - Fix "applicatoin" -> "application"
 */
function normalizeProtocolName(
  name: string | null | undefined
): string | null {
  if (!name) return null;
  let val = name.trim().toLowerCase();
  val = val.replace(/applicatoin/g, "application");
  val = val.replace(/\s+/g, "_");
  return val;
}

/**
 * Normalize swing / type column
 */
function normalizeType(
  t: string | null | undefined
): string | null {
  if (!t) return null;
  const val = t.trim().toLowerCase();

  if (val === "dominant" || val === "odminant") return "dominant";
  if (
    val === "non_dominant" ||
    val === "non-dominant" ||
    val === "onn-dominant"
  ) {
    return "non_dominant";
  }

  // Different spellings / spacing
  if (val === "dry_swings" || val === "dry swings") return "dry_swings";
  if (val === "hits") return "hits";
  if (val === "live_hits" || val === "live hits") return "live_hits";
  if (val === "tee_hits" || val === "tee hits") return "tee_hits";
  if (val === "lead_arm") return "lead_arm";
  if (val === "trail_arm") return "trail_arm";

  // "Drill Movements" is more of a description, not a swing side → ignore
  if (val === "drill movements" || val === "drill_movement") {
    return null;
  }

  // Fallback: return the raw lowercased value
  return val;
}

/**
 * Normalize velo config
 */
function normalizeVeloConfig(
  v: string | null | undefined
): string | null {
  if (!v) return null;
  const val = v.trim().toLowerCase();

  if (val === "base_bat") return "base_bat";
  if (val === "green_sleeve") return "green_sleeve";
  if (val === "green_sleeve_puck") return "green_sleeve_puck";
  if (val === "full_loaded" || val === "fully loaded") {
    return "full_loaded";
  }
  if (val === "game_bat" || val === "game bat" || val === "gamebat") {
    return "game_bat";
  }

  return val;
}

/**
 * Turn a slug into a human title:
 * "power_mechanics_ground_force_level_1" -> "Power mechanics ground force level 1"
 */
function humanizeSlug(s: string | null | undefined): string {
  if (!s) return "";
  const replaced = s.replace(/-/g, " ");
  const parts = replaced.split("_");
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Resolve the drill name from the row
 * - Prefer "Drill 1" (new sheet)
 * - Fallback to "Drills" if present
 */
function getDrillName(row: RawRow): string | null {
  const v = row["Drill 1"] ?? row.Drills ?? null;
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

/**
 * Decide metric based on data_capture column
 * - "max exit velo" → exit_velo_mph
 * - anything else non-empty → bat_speed_mph
 */
function metricFromDataCapture(dataCapture: string | null | undefined): {
  metric_key: string | null;
  metric_label: string | null;
  unit: string | null;
  is_required: boolean;
} {
  if (!dataCapture) {
    return {
      metric_key: null,
      metric_label: null,
      unit: null,
      is_required: false
    };
  }

  const v = dataCapture.trim().toLowerCase();

  if (v.includes("exit velo") || v.includes("exit_velo")) {
    return {
      metric_key: "exit_velo_mph",
      metric_label: "Exit velo (mph)",
      unit: "mph",
      is_required: true
    };
  }

  // Default: bat speed metric
  return {
    metric_key: "bat_speed_mph",
    metric_label: "Bat speed (mph)",
    unit: "mph",
    is_required: true
  };
}

/**
 * Parse reps into a number if possible
 */
function parseReps(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  const s = raw.toString().trim().toLowerCase();
  if (!s || s === "variable") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const excelPath = "./data/add_protocols.xlsx";

  console.log(`Reading Excel file from ${excelPath} ...`);
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rawRows = XLSX.utils.sheet_to_json<RawRow>(sheet, {
    defval: null
  });

  // Only rows that actually have a protocol_name
  const rows = rawRows.filter((row) => row.protocol_name);

  if (rows.length === 0) {
    throw new Error(
      "No protocol rows found in add_protocols.xlsx (check headers and sheet)."
    );
  }

  // Group by normalized protocol_name
  const byProtocol = new Map<string, RawRow[]>();

  for (const row of rows) {
    const slug = normalizeProtocolName(row.protocol_name ?? null);
    if (!slug) continue;
    const list = byProtocol.get(slug) ?? [];
    list.push(row);
    byProtocol.set(slug, list);
  }

  // Drill descriptions: first non-empty per (protocolSlug, drillName)
  const descriptionByKey = new Map<string, string>();

  for (const [protocolSlug, protoRows] of byProtocol.entries()) {
    for (const row of protoRows) {
      const drill = getDrillName(row);
      const desc = row.drill_description;
      if (!drill || !desc) continue;
      const key = `${protocolSlug}::${drill}`;
      if (!descriptionByKey.has(key)) {
        descriptionByKey.set(key, desc);
      }
    }
  }

  // Build protocol defs
  const protocols: ProtocolDef[] = [];

  for (const [protocolSlug, protoRows] of byProtocol.entries()) {
    const withCategory =
      protoRows.find((r) => r["Protocol Category"]) ?? protoRows[0];

    const catNorm = normalizeCategory(
      withCategory["Protocol Category"] ?? null
    );
    if (!catNorm) {
      throw new Error(
        `Missing or invalid category for protocol ${protocolSlug}`
      );
    }

    const title = humanizeSlug(protocolSlug);
    const isAssessment = catNorm === "assessments";

    protocols.push({
      id: uuidv4(),
      protocolName: protocolSlug,
      title,
      category: catNorm,
      isAssessment
    });
  }

  // Map for quick ID lookup
  const protocolIdByName = new Map<string, string>();
  protocols.forEach((p) => {
    protocolIdByName.set(p.protocolName, p.id);
  });

  // Build step defs
  const steps: StepDef[] = [];

  for (const proto of protocols) {
    const protoRows = byProtocol.get(proto.protocolName) ?? [];

    protoRows.forEach((row, index) => {
      const drill = getDrillName(row) || "Drill";
      const key = `${proto.protocolName}::${drill}`;
      const descriptionFromMap = descriptionByKey.get(key);
      const instructions =
        (descriptionFromMap ?? row.drill_description ?? null) || null;

      const veloConfig = normalizeVeloConfig(row.velo_config ?? null);
      const swingType = normalizeType(row.type ?? null);

      const titleParts: string[] = [humanizeSlug(drill)];
      if (veloConfig) titleParts.push(humanizeSlug(veloConfig));
      if (swingType) titleParts.push(humanizeSlug(swingType));
      const stepTitle = titleParts.join(" - ");

      const dataCapture = row.data ?? null;
      const metricInfo = metricFromDataCapture(dataCapture);

      const targetReps = parseReps(row.reps ?? null);

      steps.push({
        id: uuidv4(),
        protocol_id: proto.id,
        step_order: index + 1,
        title: stepTitle,
        instructions,
        metric_key: metricInfo.metric_key,
        metric_label: metricInfo.metric_label,
        unit: metricInfo.unit,
        is_required: metricInfo.is_required,
        target_reps: targetReps,
        velo_config: veloConfig,
        swing_type: swingType,
        data_capture: dataCapture
      });
    });
  }

  console.log(
    `Prepared ${protocols.length} protocols and ${steps.length} steps from add_protocols.xlsx`
  );

  // Insert into Supabase
  console.log("Inserting protocols...");
  const { error: protoError } = await supabaseAdmin
    .from("protocols")
    .insert(
      protocols.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        description: null,
        video_url: null,
        is_assessment: p.isAssessment,
        is_premium: false,
        estimated_minutes: null
      }))
    );

  if (protoError) {
    console.error("Error inserting protocols:", protoError);
    throw protoError;
  }

  console.log("Inserting protocol steps...");
  const { error: stepsError } = await supabaseAdmin
    .from("protocol_steps")
    .insert(
      steps.map((s) => ({
        id: s.id,
        protocol_id: s.protocol_id,
        step_order: s.step_order,
        title: s.title,
        instructions: s.instructions,
        metric_key: s.metric_key,
        metric_label: s.metric_label,
        unit: s.unit,
        is_required: s.is_required,
        target_reps: s.target_reps,
        velo_config: s.velo_config,
        swing_type: s.swing_type,
        data_capture: s.data_capture
      }))
    );

  if (stepsError) {
    console.error("Error inserting protocol steps:", stepsError);
    throw stepsError;
  }

  console.log("✅ Additional protocol seeding complete.");
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
