import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ACHIEVEMENT_CATALOG } from "../../src/domain/achievements/AchievementCatalog";
import type {
  AchievementDefinition,
  CareerAchievementSnapshot,
} from "../../src/domain/achievements/AchievementContracts";
import { evaluateCareerAchievement } from "../../src/domain/achievements/AchievementEvaluator";

const migration = readFileSync(
  "supabase/migrations/202609010006_achievements_01_phase_3b_2b_career_runtime.sql",
  "utf8",
).toLowerCase();
const verification = readFileSync(
  "supabase/tests/achievements_01_phase_3b_2b_career_runtime_verification.sql",
  "utf8",
).toLowerCase();
const careerDefinitions = ACHIEVEMENT_CATALOG.filter(
  (definition) => definition.category !== "single-match",
);
const pieces = (value = 0) => ({
  pawn: value, knight: value, bishop: value, rook: value, queen: value, king: value,
});

function snapshotFor(definition: AchievementDefinition, value: number): CareerAchievementSnapshot {
  const snapshot: CareerAchievementSnapshot = {
    singleplayer: { completedGames: 0, kingsCaptured: 0, bestWinStreak: 0, level: 1 },
    ranked: { completedGames: 0, wins: 0, bestWinStreak: 0, currentRating: 0 },
    global: { rouletteRolls: 0, threeRightsTurns: 0, movesByPiece: pieces(), tripleRollsByPiece: pieces() },
  };
  switch (definition.metric) {
    case "singleplayer-games": return { ...snapshot, singleplayer: { ...snapshot.singleplayer, completedGames: value } };
    case "singleplayer-kings-captured": return { ...snapshot, singleplayer: { ...snapshot.singleplayer, kingsCaptured: value } };
    case "singleplayer-best-win-streak": return { ...snapshot, singleplayer: { ...snapshot.singleplayer, bestWinStreak: value } };
    case "singleplayer-level": return { ...snapshot, singleplayer: { ...snapshot.singleplayer, level: value } };
    case "ranked-wins": return { ...snapshot, ranked: { ...snapshot.ranked, wins: value } };
    case "ranked-games": return { ...snapshot, ranked: { ...snapshot.ranked, completedGames: value } };
    case "ranked-best-win-streak": return { ...snapshot, ranked: { ...snapshot.ranked, bestWinStreak: value } };
    case "ranked-rating": return { ...snapshot, ranked: { ...snapshot.ranked, currentRating: value } };
    case "global-roulette-rolls": return { ...snapshot, global: { ...snapshot.global, rouletteRolls: value } };
    case "global-three-rights-turns": return { ...snapshot, global: { ...snapshot.global, threeRightsTurns: value } };
    case "global-pawn-moves": return { ...snapshot, global: { ...snapshot.global, movesByPiece: { ...pieces(), pawn: value } } };
    case "global-knight-moves": return { ...snapshot, global: { ...snapshot.global, movesByPiece: { ...pieces(), knight: value } } };
    case "global-king-moves": return { ...snapshot, global: { ...snapshot.global, movesByPiece: { ...pieces(), king: value } } };
    case "global-triple-piece-types": {
      const order = ["pawn", "knight", "bishop", "rook", "queen", "king"] as const;
      return { ...snapshot, global: { ...snapshot.global,
        tripleRollsByPiece: Object.fromEntries(order.map((piece, index) => [piece, index < value ? 1 : 0])),
      } };
    }
    case "global-triple-rolls": return { ...snapshot, global: { ...snapshot.global, tripleRollsByPiece: { ...pieces(), pawn: value } } };
    default: throw new Error(`Unhandled career metric: ${definition.metric}`);
  }
}

describe("ACHIEVEMENTS-01 Phase 3B-2B career runtime", () => {
  it("keeps all 22 pure-domain career thresholds correct below, at, and above", () => {
    expect(careerDefinitions).toHaveLength(22);
    for (const definition of careerDefinitions) {
      expect(evaluateCareerAchievement(
        definition,
        snapshotFor(definition, Math.max(0, definition.target - 1)),
      ).eligible, `${definition.id} below`).toBe(false);
      expect(evaluateCareerAchievement(
        definition,
        snapshotFor(definition, definition.target),
      ).eligible, `${definition.id} at`).toBe(true);
      expect(evaluateCareerAchievement(
        definition,
        snapshotFor(definition, definition.target + 1),
      ).eligible, `${definition.id} above`).toBe(true);
    }
  });

  it("binds SP evaluation after canonical counter updates and preserves replay return", () => {
    const replay = migration.indexOf("if existing_hash is not null then");
    const progression = migration.indexOf("update public.player_progression set");
    const evaluation = migration.indexOf("perform private.evaluate_and_persist_career_achievements(\n    target,'singleplayer'");
    expect(replay).toBeGreaterThan(-1);
    expect(progression).toBeGreaterThan(replay);
    expect(evaluation).toBeGreaterThan(progression);
    expect(migration.slice(replay, progression)).toContain("return private.current_player_profile_json()");
  });

  it("settles ranked rating before career evaluation and keeps unranked separate", () => {
    const wrapper = migration.match(
      /create or replace function private\.settle_multiplayer_match_if_eligible[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
    expect(wrapper.indexOf("private.settle_ranked_match")).toBeLessThan(
      wrapper.indexOf("'multiplayer-ranked',match_row.match_id"),
    );
    expect(wrapper).toContain("private.record_unranked_match_completion");
    expect(wrapper).toContain("'multiplayer-unranked',match_row.match_id");
    expect(wrapper).toContain("'disconnect-forfeit'");
  });

  it("enables only career IDs and preserves lower-bound missing-history semantics", () => {
    for (const definition of careerDefinitions) expect(migration).toContain(`'${definition.id}'`);
    for (const definition of ACHIEVEMENT_CATALOG.filter((item) => item.category === "single-match")) {
      expect(migration).not.toContain(`'${definition.id}'`);
    }
    expect(migration).toContain("known counters are lower bounds");
    expect(migration).not.toMatch(/insert into private\.player_achievement_unlocks[\s\S]*select/);
    expect(migration).not.toContain("retroactive-career");
  });

  it("keeps write authority private and verification transactional", () => {
    expect(migration).toContain(
      "revoke all on function private.evaluate_and_persist_career_achievements(uuid,text,uuid)",
    );
    expect(migration).not.toContain("grant execute on function private.evaluate_and_persist_career_achievements");
    expect(verification.trimStart()).toMatch(/^--[\s\S]*?begin;/);
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("singleplayer_atomic_failure_rolls_back");
    expect(verification).toContain("multiplayer_atomic_failure_rolls_back");
    expect(verification).toContain("single_match_ids_never_unlocked");
  });
});
