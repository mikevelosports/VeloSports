import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabaseClient";

interface RawRow {
  [key: string]: any;
  "Protocol Category"?: string | null;
  "Protocol Level"?: string | null;
  protocol_name?: string | null;
  velo_config?: string | null;
  Drills?: string | null;
  drill_description?: string | null;
  type?: string | null;
  reps?: number | null;
  data?: string | null;
}

interface ProtocolDef {
  id: string;
  protocolName: string;
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

function normalizeCategory(cat: string | null | undefined): string | null {
  if (!cat) return null;
  const val = cat.trim().toLowerCase();
  if (val === "overspeed") return "overspeed";
  if (val === "counterweight") return "counterweight";
  if (val === "warm-up" || val === "warm_up" || val === "warm up") return "warm_up";
  if (val === "power_mechanics" || val === "power_mechancis") return "power_mechanics";
  if (val === "assessments" || val === "assessment") return "assessments";
  return val;
}

function normalizeType(t: string | null | undefined): string | null {
  if (!t) return null;
  const val = t.trim().toLowerCase();
  if (val === "dominant" || val === "odminant") return "dominant";
  if (val === "non_dominant" || val === "non-dominant" || val === "onn-dominant") {
    return "non_dominant";
  }
  if (val === "dry_swings") return "dry_swings";
  if (val === "hits") return "hits";
  if (val === "live_hits") return "live_hits";
  if (val === "tee_hits") return "tee_hits";
  if (val === "lead_arm") return "lead_arm";
  if (val === "trail_arm") return "trail_arm";
  return val;
}

function normalizeVeloConfig(v: string | null | undefined): string | null {
  if (!v) return null;
  const val = v.trim().toLowerCase();
  if (val === "base_bat") return "base_bat";
  if (val === "green_sleeve") return "green_sleeve";
  if (val === "green_sleeve_puck") return "green_sleeve_puck";
  if (val === "full_loaded" || val === "fully loaded") return "full_loaded";
  if (val === "game_bat") return "game_bat";
  return val;
}

function humanizeSlug(s: string | null | undefined): string {
  if (!s) return "";
  // replace hyphens with spaces, underscores with spaces, then title-case
  const replaced = s.replace(/-/g, " ");
  const parts = replaced.split("_");
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

async function main() {
  const excelPath = "./data/protocol_details.xlsx";

  console.log(`Reading Excel file from ${excelPath} ...`);
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as RawRow[];

  const rows = rawRows.filter((row) => row.protocol_name);

  if (rows.length === 0) {
    throw new Error("No protocol rows found in spreadsheet (check headers and sheet).");
  }

  // Group by protocol_name, preserving order
  const byProtocol = new Map<string, RawRow[]>();
  for (const row of rows) {
    const protocolName = row.protocol_name;
    if (!protocolName) continue;
    const list = byProtocol.get(protocolName) ?? [];
    list.push(row);
    byProtocol.set(protocolName, list);
  }

  // Drill descriptions: first non-empty per (protocol_name, Drill)
  const descriptionByKey = new Map<string, string>();
  for (const [protocolName, protoRows] of byProtocol.entries()) {
    for (const row of protoRows) {
      const drill = row.Drills;
      const desc = row.drill_description;
      if (!drill || !desc) continue;
      const key = `${protocolName}::${drill}`;
      if (!descriptionByKey.has(key)) {
        descriptionByKey.set(key, desc);
      }
    }
  }

  // Build protocol defs
  const protocols: ProtocolDef[] = [];
  for (const [protocolName, protoRows] of byProtocol.entries()) {
    const withCategory =
      protoRows.find((r) => r["Protocol Category"]) ?? protoRows[0];
    const catNorm = normalizeCategory(withCategory["Protocol Category"] ?? null);
    if (!catNorm) {
      throw new Error(`Missing or invalid category for protocol ${protocolName}`);
    }
    const title = humanizeSlug(protocolName);
    const isAssessment = catNorm === "assessments";

    protocols.push({
      id: uuidv4(),
      protocolName,
      title,
      category: catNorm,
      isAssessment
    });
  }

  // Map for quick lookup
  const protocolIdByName = new Map<string, string>();
  protocols.forEach((p) => {
    protocolIdByName.set(p.protocolName, p.id);
  });

  // Build step defs
  const steps: StepDef[] = [];

  for (const proto of protocols) {
    const protoRows = byProtocol.get(proto.protocolName) ?? [];
    protoRows.forEach((row, index) => {
      const drill = row.Drills || "Drill";
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
      const hasMetric = !!dataCapture;

      let targetReps: number | null = null;
      if (typeof row.reps === "number" && !Number.isNaN(row.reps)) {
        targetReps = row.reps;
      }

      steps.push({
        id: uuidv4(),
        protocol_id: proto.id,
        step_order: index + 1,
        title: stepTitle,
        instructions,
        metric_key: hasMetric ? "bat_speed_mph" : null,
        metric_label: hasMetric ? "Bat speed (mph)" : null,
        unit: hasMetric ? "mph" : null,
        is_required: hasMetric,
        target_reps: targetReps,
        velo_config: veloConfig,
        swing_type: swingType,
        data_capture: dataCapture
      });
    });
  }

  console.log(`Prepared ${protocols.length} protocols and ${steps.length} steps`);

  // Insert into Supabase
  console.log("Inserting protocols...");
  const { error: protoError } = await supabaseAdmin.from("protocols").insert(
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
    console.error(protoError);
    throw protoError;
  }

  console.log("Inserting protocol steps...");
  const { error: stepsError } = await supabaseAdmin.from("protocol_steps").insert(
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
    console.error(stepsError);
    throw stepsError;
  }

  console.log("✅ Protocol seeding complete.");
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
