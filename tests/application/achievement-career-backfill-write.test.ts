import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202609010007_achievements_01_phase_3b_2c_2_career_backfill.sql",
  "utf8",
);
const preflight = readFileSync(
  "supabase/tests/achievements_01_phase_3b_2c_2_preflight.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/tests/achievements_01_phase_3b_2c_2_verification.sql",
  "utf8",
);

const careerIds = [
  "rookie_campaign", "hundred_games", "dedicated_player", "king_hunter",
  "capture_hundred_kings", "winning_run", "ranked_victor", "ranked_regular",
  "ranked_veteran", "winning_streak", "rating_climber", "elite_player",
  "wheel_spinner", "roulette_master", "roll_collector", "triple_crown",
  "triple_collector", "full_rights", "pawn_commander", "knight_specialist",
  "royal_maneuvers", "roulette_legend",
] as const;
const singleMatchIds = [
  "the_long_march", "royal_ascension", "last_one_standing", "wheels_favor",
  "against_all_odds", "untouchable", "pawn_rebellion", "perfect_rhythm",
] as const;

describe("controlled career backfill SQL", () => {
  it("keeps preflight and verification aggregate-only and read-only", () => {
    expect(preflight).toContain("repeatable read read only");
    expect(preflight.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("repeatable read read only");
    expect(verification.trimEnd()).toMatch(/rollback;$/);
  });

  it("uses the exact 22 career IDs and excludes all single-match IDs", () => {
    for (const id of careerIds) expect(migration).toContain(`'${id}'`);
    for (const id of singleMatchIds) {
      expect(migration).not.toContain(`'${id}'`);
      expect(preflight).toContain(`'${id}'`);
      expect(verification).toContain(`'${id}'`);
    }
    expect(migration.match(/\('(?:[a-z_]+)','(?:[a-z_]+)',\d+\)/g)).toHaveLength(22);
  });

  it("locks active PlayerIds and writes fixed idempotent provenance", () => {
    expect(migration).toContain("where lifecycle='active' order by player_id for update");
    expect(migration).toContain("on conflict (player_id,achievement_id) do nothing");
    expect(migration).toContain("'retroactive-career'");
    expect(migration).toContain("'3b2c2000-0000-4000-8000-000000000001'::uuid,1");
  });

  it("preserves lower-bound, current-rating, and level-50 semantics", () => {
    expect(preflight).toContain("trusted-lower-bound");
    expect(preflight).toContain("canonical-current-not-peak");
    for (const sql of [preflight, migration, verification]) expect(sql).toContain("40180");
  });

  it("does not mutate progression, rating, match, telemetry, or existing unlock metadata", () => {
    expect(migration).not.toMatch(/update\s+(?:public\.)?player_/i);
    expect(migration).not.toMatch(/delete\s+from/i);
    expect(migration).not.toMatch(/drop\s+|truncate\s+/i);
    expect(migration).toMatch(/insert into private\.player_achievement_unlocks/i);
    expect(migration).not.toMatch(/do update/i);
  });

  it("keeps the trusted read and write privilege boundary under verification", () => {
    expect(verification).toContain("browser_write_denied");
    expect(verification).toContain("authenticated_read_allowed");
    expect(verification).toContain("anon_read_denied");
    expect(verification).toContain("no_proven_eligible_career_unlock_remains_locked");
  });
});
