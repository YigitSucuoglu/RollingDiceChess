import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ACHIEVEMENT_CATALOG } from "../../src/domain/achievements/AchievementCatalog";

const dryRun = readFileSync(
  "supabase/tests/achievements_01_phase_3b_2c_1_backfill_dry_run.sql",
  "utf8",
);
const runtime = readFileSync(
  "supabase/migrations/202609010006_achievements_01_phase_3b_2b_career_runtime.sql",
  "utf8",
).toLowerCase();
const lowerDryRun = dryRun.toLowerCase();

function catalogRows(): readonly { id: string; threshold: number }[] {
  const block = dryRun.match(
    /career_catalog\(achievement_id,category,metric,threshold,coverage\) as \(values([\s\S]*?)\n\),/,
  )?.[1];
  if (!block) throw new Error("Dry-run career catalog was not found.");
  return [...block.matchAll(/\('([^']+)','[^']+','[^']+',([0-9]+),'[^']+'\)/g)]
    .map((match) => ({ id: match[1], threshold: Number(match[2]) }));
}

function executableSql(source: string): string {
  return source
    .replace(/--.*$/gm, "")
    .replace(/'(?:''|[^'])*'/g, "''")
    .toLowerCase();
}

describe("ACHIEVEMENTS-01 Phase 3B-2C-1 backfill dry-run", () => {
  it("covers exactly the 22 domain career IDs with matching thresholds", () => {
    const expected = ACHIEVEMENT_CATALOG
      .filter((definition) => definition.category !== "single-match")
      .map(({ id, target }) => ({
        id,
        threshold: id === "roulette_legend" ? 40180
          : id === "knight_specialist" ? 250 : id === "royal_maneuvers" ? 100 : target,
      }));
    const actual = catalogRows();
    expect(actual).toHaveLength(22);
    expect(new Set(actual.map(({ id }) => id)).size).toBe(22);
    expect(actual).toEqual(expected);
  });

  it("keeps the eight single-match IDs outside the eligibility catalog", () => {
    const ids = new Set(catalogRows().map(({ id }) => id));
    const singleMatch = ACHIEVEMENT_CATALOG.filter(
      (definition) => definition.category === "single-match",
    );
    expect(singleMatch).toHaveLength(8);
    for (const definition of singleMatch) expect(ids.has(definition.id)).toBe(false);
    expect(lowerDryRun).toContain("single_match_candidate_count");
  });

  it("is structurally read-only and never calls a side-effecting helper", () => {
    const sql = executableSql(dryRun);
    expect(sql).toContain("begin transaction isolation level repeatable read read only");
    expect(sql.trimEnd()).toMatch(/rollback;$/);
    expect(sql).not.toMatch(/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke)\b/);
    expect(sql).not.toContain("persist_player_achievement_unlock");
    expect(sql).not.toContain("evaluate_and_persist_career_achievements");
    expect(sql).not.toContain("apply_player_progression_operation");
    expect(sql).not.toContain("settle_multiplayer_match_if_eligible");
  });

  it("uses active PlayerIds internally while exposing aggregate output only", () => {
    expect(lowerDryRun).toContain("where player.lifecycle='active'");
    expect(lowerDryRun).toContain("retired_candidate_count");
    expect(lowerDryRun).toContain("existing_unlocks_fully_excluded");
    expect(lowerDryRun).toContain("duplicate_candidate_count");
    expect(executableSql(dryRun)).not.toMatch(
      /auth\.users|player_auth_owners|email|display_name|public_discriminator/,
    );
    expect(lowerDryRun).toContain("jsonb_agg(jsonb_build_object(");
  });

  it("documents lower-bound telemetry and current-not-peak rating semantics", () => {
    expect(lowerDryRun).toContain("'winning_streak','ranked-multiplayer','ranked_best_streak',5,'trusted-lower-bound'");
    expect(lowerDryRun).toContain("'global-multiplayer-telemetry'");
    expect(lowerDryRun).toContain("'canonical-current-not-peak'");
    expect(lowerDryRun).toContain("progression.roulette_rolls::bigint");
    expect(lowerDryRun).toContain("coalesce(multiplayer.roulette_rolls,0)");
  });

  it("preserves the historical dry-run thresholds and level-50 XP boundary", () => {
    const fragments: Readonly<Record<string, string>> = {
      rookie_campaign: "progression.games_played>=10",
      hundred_games: "progression.games_played>=100",
      dedicated_player: "progression.games_played>=500",
      king_hunter: "progression.kings_captured>=10",
      capture_hundred_kings: "progression.kings_captured>=100",
      winning_run: "progression.best_win_streak>=3",
      ranked_victor: "rating.ranked_wins>=1",
      ranked_regular: "rating.rated_games>=25",
      ranked_veteran: "rating.rated_games>=100",
      winning_streak: "coalesce(multiplayer.best_ranked_win_streak,0)>=5",
      rating_climber: "rating.multiplayer_rating>=1200",
      elite_player: "rating.multiplayer_rating>=1500",
      wheel_spinner: "global_rolls>=100",
      roulette_master: "global_rolls>=1000",
      roll_collector: "global_rolls>=5000",
      triple_crown: "triple_piece_types>=6",
      triple_collector: "global_triples>=100",
      full_rights: "global_three_rights>=25",
      pawn_commander: "pawn_moves>=500",
      knight_specialist: "knight_moves>=250",
      royal_maneuvers: "king_moves>=100",
      roulette_legend: "greatest(coalesce(total_xp,0),0) >= 40180",
    };
    expect(Object.keys(fragments)).toEqual(catalogRows().map(({ id }) => id));
    for (const fragment of Object.values(fragments)) expect(runtime).toContain(fragment);
    expect(lowerDryRun).toContain("40180::bigint as verified_level_50_xp_threshold");
  });
});
