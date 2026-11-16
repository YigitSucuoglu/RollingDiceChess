import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { toPlayerId } from "../../src/application/players/PlayerContracts";
import type { SingleMatchAchievementSnapshot } from "../../src/domain/achievements/AchievementContracts";
import { createDefaultPlayerProfile } from "../../src/profile/PlayerProfile";
import { createProgressionOperation } from "../../src/profile/PlayerSync";

const migration = readFileSync(
  "supabase/migrations/202609010008_achievements_01_phase_4b_2b_1_single_match_ledger.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/tests/achievements_01_phase_4b_2b_1_single_match_ledger_verification.sql",
  "utf8",
);

function snapshot(overrides: Partial<SingleMatchAchievementSnapshot> = {}): SingleMatchAchievementSnapshot {
  return {
    matchId: "4b2b1000-0000-4000-8000-000000000001",
    mode: "singleplayer",
    playerId: toPlayerId("4b2b1000-0000-4000-8000-000000000002"),
    playerColor: "white",
    status: "completed",
    terminationReason: "king-captured",
    winner: "white",
    valid: true,
    playerSuccessfulMoves: 3,
    botSuccessfulMoves: 2,
    totalSuccessfulMoves: 5,
    promotedPawnIds: [],
    capturedEnemyPieces: 1,
    capturedOwnPieces: 0,
    pawnCaptures: 1,
    tripleRouletteResults: 0,
    currentConsecutiveThreeRightsTurns: 1,
    bestConsecutiveThreeRightsTurns: 1,
    terminalPlayerTurnMovesUsed: 3,
    finalOwnPieceCount: 16,
    complete: true,
    ...overrides,
  };
}

function completedProfiles() {
  const before = createDefaultPlayerProfile();
  before.playerId = "4b2b1000-0000-4000-8000-000000000002";
  const after = structuredClone(before);
  after.totalXp = 25;
  after.statistics.gamesPlayed = 1;
  after.statistics.wins = 1;
  return { before, after };
}

describe("versioned single-match progression payload", () => {
  it("keeps operation and match identities separate and survives queue JSON round-trip", () => {
    const { before, after } = completedProfiles();
    const operation = createProgressionOperation(
      before,
      after,
      "4b2b1000-0000-4000-8000-000000000003",
      snapshot(),
    );
    const persisted = JSON.parse(JSON.stringify(operation));

    expect(persisted.operationId).toBe("4b2b1000-0000-4000-8000-000000000003");
    expect(persisted.payload.singleMatch).toEqual({
      schemaVersion: 1,
      matchId: "4b2b1000-0000-4000-8000-000000000001",
      snapshot: snapshot(),
    });
    expect(persisted.payload.singleMatch.matchId).not.toBe(persisted.operationId);
  });

  it("preserves legacy operations without fabricating a match identity", () => {
    const { before, after } = completedProfiles();
    const operation = createProgressionOperation(before, after, "legacy-operation");
    expect(operation?.payload).not.toHaveProperty("singleMatch");
  });

  it.each([
    snapshot({ status: "abandoned", terminationReason: "abandoned", complete: false }),
    snapshot({ status: "technical-abort", terminationReason: "technical-abort", complete: false }),
    snapshot({ mode: "ranked-multiplayer" }),
  ])("does not serialize an ineligible completion snapshot", (candidate) => {
    const { before, after } = completedProfiles();
    expect(createProgressionOperation(before, after, "operation", candidate)).toBeNull();
  });
});

describe("single-match completion ledger SQL contract", () => {
  it("keeps operation and match idempotency as separate private layers", () => {
    expect(migration).toContain("create table private.player_singleplayer_match_completions");
    expect(migration).toContain("match_id uuid primary key");
    expect(migration).toContain("player_progression_operations");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(resolved_match_id::text, 0))");
    expect(migration).toContain("match id was already used with another completion payload");
    expect(migration).toContain("single-player match belongs to another canonical player");
  });

  it("preserves legacy/career behavior and does not evaluate single-match achievement IDs", () => {
    expect(migration).toContain("single_match is not null");
    expect(migration).toContain("evaluate_and_persist_career_achievements");
    for (const id of [
      "the_long_march", "royal_ascension", "last_one_standing", "wheels_favor",
      "against_all_odds", "untouchable", "pawn_rebellion", "perfect_rhythm",
    ]) expect(migration).not.toContain(`'${id}'`);
  });

  it("ships a rollback-only remote verification with security and replay checks", () => {
    expect(verification.trimStart()).toMatch(/^--[\s\S]*?begin;/);
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("legacy_operation_compatible");
    expect(verification).toContain("same_match_different_operation_exactly_once");
    expect(verification).toContain("same_match_different_payload_rejected");
    expect(verification).toContain("private_ledger_browser_read_denied");
    expect(verification).toContain("no_single_match_unlock_persistence");
  });
});
