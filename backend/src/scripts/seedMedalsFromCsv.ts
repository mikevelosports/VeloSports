// backend/scripts/seedMedalsFromCsv.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

// 1) Configure these env vars in your backend environment
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

// 2) Path to your CSV export (same columns as velo_medals.xlsx)
const CSV_PATH = path.join(__dirname, "velo_medals.csv");

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const csvRaw = fs.readFileSync(CSV_PATH, "utf8");
  const records = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true
  }) as Array<Record<string, string>>;

  const rows = records
    .map((row) => {
      const category = row["category"]?.trim();
      const badge_name = row["badge_name"]?.trim();
      const age_group = row["age_group"]?.trim();
      const badge_tier = row["badge_tier"]?.trim();
      const metric_code = row["metric_code"]?.trim();
      const thresholdRaw = row["threshold"]?.trim();
      const threshold_type = row["threshold type"]?.trim() || null;
      const description = row["description"]?.trim() || null;
      const file_name = row["file_name"]?.trim();
      const file_type = row["file_type"]?.trim() || "png";

      // Skip header/empty rows
      if (!category || !badge_name || !metric_code || !file_name) {
        return null;
      }

      let threshold_value: number | null = null;
      let threshold_text: string | null = null;

      if (thresholdRaw) {
        const numeric = Number(thresholdRaw);
        if (!Number.isNaN(numeric)) {
          threshold_value = numeric;
        } else {
          threshold_text = thresholdRaw;
        }
      }

      return {
        category,
        badge_name,
        age_group,
        badge_tier,
        metric_code,
        threshold_value,
        threshold_text,
        threshold_type,
        description,
        file_name,
        file_type
      };
    })
    .filter(Boolean) as any[];

  console.log(`Upserting ${rows.length} medals...`);

  const { error } = await supabase
    .from("medals")
    .upsert(rows, { onConflict: "metric_code" });

  if (error) {
    console.error("Error upserting medals:", error);
    process.exit(1);
  }

  console.log("Medals seeded successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
