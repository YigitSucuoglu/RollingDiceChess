import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function evaluator(path: string): string {
  const sql = readFileSync(path, "utf8");
  const body = sql.match(/create or replace function private\.evaluate_and_persist_career_achievements\([\s\S]*?\n\$\$;/)?.[0];
  if (!body) throw new Error("Career evaluator is missing.");
  return body;
}

describe("UI-02 additive Piece Mastery SQL", () => {
  it("changes only knight and king thresholds, preserving all other evaluator conditions", () => {
    const previous = evaluator("supabase/migrations/202609010006_achievements_01_phase_3b_2b_career_runtime.sql");
    const current = evaluator("supabase/migrations/202609010011_achievements_01_ui_02_piece_mastery_500.sql");
    expect(current).toBe(previous.replace("knight_moves>=250", "knight_moves>=500")
      .replace("king_moves>=100", "king_moves>=500"));
  });

  it("leaves existing rows untouched and verifies with rollback-only fixtures", () => {
    const migration = readFileSync("supabase/migrations/202609010011_achievements_01_ui_02_piece_mastery_500.sql", "utf8");
    const verification = readFileSync("supabase/tests/achievements_01_ui_02_piece_mastery_500_verification.sql", "utf8");
    expect(migration.replace(/--.*$/gm, "")).not.toMatch(/^\s*(delete|truncate|drop|update|insert)\b/im);
    expect(verification.trimEnd()).toMatch(/rollback;$/i);
    expect(verification).toContain("old_thresholds_do_not_unlock");
    expect(verification).toContain("new_500_threshold_unlocks_all_three");
  });
});
