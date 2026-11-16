import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { toPlayerId } from "../../src/application/players/PlayerContracts";
import { ACHIEVEMENT_DEFINITIONS } from "../../src/domain/achievements/AchievementCatalog";
import type { AchievementId, SingleMatchAchievementSnapshot } from "../../src/domain/achievements/AchievementContracts";
import { evaluateSingleMatchAchievements } from "../../src/domain/achievements/AchievementEvaluator";

const migration = readFileSync(
  "supabase/migrations/202609010009_achievements_01_phase_4b_2b_2_single_match_unlocks.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/tests/achievements_01_phase_4b_2b_2_single_match_unlocks_verification.sql",
  "utf8",
);
const challengeIds = [
  "the_long_march", "royal_ascension", "last_one_standing", "wheels_favor",
  "against_all_odds", "untouchable", "pawn_rebellion", "perfect_rhythm",
] as const satisfies readonly AchievementId[];

function snapshot(overrides: Partial<SingleMatchAchievementSnapshot> = {}): SingleMatchAchievementSnapshot {
  return {
    matchId: "4b2b2000-0000-4000-8000-000000000001",
    mode: "singleplayer",
    playerId: toPlayerId("4b2b2000-0000-4000-8000-000000000002"),
    playerColor: "white",
    status: "completed",
    terminationReason: "king-captured",
    winner: "white",
    valid: true,
    playerSuccessfulMoves: 40,
    botSuccessfulMoves: 35,
    totalSuccessfulMoves: 75,
    promotedPawnIds: ["pawn-a", "pawn-b", "pawn-c"],
    capturedEnemyPieces: 12,
    capturedOwnPieces: 0,
    pawnCaptures: 8,
    tripleRouletteResults: 4,
    currentConsecutiveThreeRightsTurns: 9,
    bestConsecutiveThreeRightsTurns: 9,
    terminalPlayerTurnMovesUsed: 3,
    finalOwnPieceCount: 16,
    complete: true,
    ...overrides,
  };
}

function eligible(value: SingleMatchAchievementSnapshot): readonly AchievementId[] {
  return evaluateSingleMatchAchievements(value)
    .filter((result) => result.eligible)
    .map((result) => result.achievementId);
}

describe("single-match SQL evaluator parity", () => {
  it("pins all eight catalog thresholds in both TypeScript and SQL", () => {
    const expectedThresholds: Readonly<Record<(typeof challengeIds)[number], number>> = {
      the_long_march: 75, royal_ascension: 3, last_one_standing: 12, wheels_favor: 4,
      against_all_odds: 3, untouchable: 0, pawn_rebellion: 8, perfect_rhythm: 10,
    };
    for (const id of challengeIds) {
      expect(ACHIEVEMENT_DEFINITIONS[id].target).toBe(expectedThresholds[id]);
      expect(migration).toContain(`('${id}',`);
      expect(migration).toMatch(new RegExp(`${id.replaceAll("_", "_")}'[^\n]+${expectedThresholds[id]}`));
    }
  });

  it("matches positive, distinct promotion and terminal-third-right semantics", () => {
    expect(eligible(snapshot())).toEqual([
      "the_long_march", "royal_ascension", "last_one_standing", "wheels_favor",
      "untouchable", "pawn_rebellion", "perfect_rhythm",
    ]);
    expect(eligible(snapshot({ capturedOwnPieces: 13, finalOwnPieceCount: 3 })))
      .toContain("against_all_odds");
    expect(eligible(snapshot({ promotedPawnIds: ["pawn-a", "pawn-b", "pawn-b"] })))
      .not.toContain("royal_ascension");
    expect(eligible(snapshot({ terminalPlayerTurnMovesUsed: 2 })))
      .not.toContain("perfect_rhythm");
  });

  it("allows five non-victory challenges on timeout and excludes king-capture-only IDs", () => {
    expect(eligible(snapshot({ terminationReason: "timeout" }))).toEqual([
      "the_long_march", "royal_ascension", "wheels_favor", "pawn_rebellion", "perfect_rhythm",
    ]);
  });

  it("integrates through first ledger insert without altering the career evaluator", () => {
    expect(migration).toContain("after insert on private.player_singleplayer_match_completions");
    expect(migration).toContain("private.persist_player_achievement_unlock(");
    expect(migration).toContain("'singleplayer-match',new.match_id,1");
    expect(migration).not.toContain("create or replace function private.evaluate_and_persist_career_achievements");
    expect(migration).not.toContain("create or replace function public.apply_player_progression_operation");
  });

  it("keeps evaluator and trigger private and verification rollback-only", () => {
    expect(migration).toContain("revoke all on function private.evaluate_single_match_achievements(jsonb)");
    expect(migration).not.toMatch(/grant execute on function private\.evaluate_single_match_achievements/);
    expect(verification.trimStart()).toMatch(/^--[\s\S]*?begin;/);
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    for (const check of [
      "all_threshold_negative_boundaries", "timeout_allows_only_five_non_victory_challenges",
      "all_eight_unlocks_persisted_once", "unlock_failure_rolls_back_entire_completion",
      "public_read_contract_returns_single_match_unlocks", "private_evaluator_browser_denied",
    ]) expect(verification).toContain(check);
  });
});
