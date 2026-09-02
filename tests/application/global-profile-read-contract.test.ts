import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeCloudProfileRow } from "../../src/infrastructure/player/SupabaseCloudPlayerSync";
import { createDefaultPlayerProfile } from "../../src/profile/PlayerProfile";
import { createProgressionOperation } from "../../src/profile/PlayerSync";

const migration = readFileSync(
  "supabase/migrations/202609010004_profile_statistics_5d_c_global_read_contract.sql", "utf8",
).toLowerCase();
const adapter = readFileSync("src/infrastructure/player/SupabaseCloudPlayerSync.ts", "utf8");

function payload() {
  const pieces = Object.fromEntries(["pawn", "knight", "bishop", "rook", "queen", "king"]
    .map((piece) => [piece, { rolls: 0, moves: 0, captures: 0 }]));
  return {
    bootstrapApplied: false, createdAt: "2026-01-01T00:00:00.000Z", displayName: "Player",
    publicDiscriminator: "ABCDE", usernameOnboardingRequired: false, playerId: "player-a",
    pieceStatistics: pieces,
    progression: { total_xp: 0, games_played: 0, wins: 0, losses: 0,
      current_win_streak: 0, best_win_streak: 0, total_play_time_seconds: 0,
      kings_captured: 0, roulette_rolls: 0, player_turns_completed: 0,
      three_rights_turns: 0, triple_pawn_rolls: 0, triple_knight_rolls: 0,
      triple_bishop_rolls: 0, triple_rook_rolls: 0, triple_queen_rolls: 0,
      triple_king_rolls: 0 },
    rating: { multiplayerRating: 1000, ratedGames: 0, rankedWins: 0,
      rankedLosses: 0, rankedWinRate: 0, unrankedGames: 0, ratingVersion: 1,
      currentRankedWinStreak: 0, bestRankedWinStreak: 0,
      totalMultiplayerPlayTimeMs: 0, multiplayerKingsCaptured: 0,
      multiplayerRouletteRolls: 0 },
    rouletteStatistics: { mostRolledPiece: null, mostRolledPieceCount: 0,
      mostPlayedPiece: null, mostPlayedPieceCount: 0, threeRightsTurns: 0,
      playerTurnsCompleted: 0, threeRightsUsedRate: 0,
      tripleRolls: ["pawn", "knight", "bishop", "rook", "queen", "king"]
        .map((pieceType) => ({ pieceType, count: 0 })) },
  };
}

describe("Phase 5D-C global Profile read contract", () => {
  it("maps the deterministic zero state and new multiplayer fields", () => {
    const result = normalizeCloudProfileRow(payload());
    expect(result.rouletteStatistics.mostRolledPiece).toBeNull();
    expect(result.rouletteStatistics.mostRolledPieceCount).toBe(0);
    expect(result.rouletteStatistics.mostPlayedPiece).toBeNull();
    expect(result.rouletteStatistics.threeRightsUsedRate).toBe(0);
    expect(result.rouletteStatistics.tripleRolls.map((item) => item.pieceType))
      .toEqual(["pawn", "knight", "bishop", "rook", "queen", "king"]);
    expect(result.multiplayerStatistics.totalMultiplayerPlayTimeMs).toBe(0);
  });

  it("rejects malformed, negative, non-finite, and unsafe counters", () => {
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const value = payload();
      value.rouletteStatistics.mostRolledPieceCount = invalid;
      expect(() => normalizeCloudProfileRow(value)).toThrow();
    }
  });

  it("includes every new Singleplayer triple in replay-safe operations", () => {
    const before = createDefaultPlayerProfile();
    const after = structuredClone(before);
    after.statistics.gamesPlayed = 1;
    after.statistics.wins = 1;
    after.statistics.tripleBishopRolls = 1;
    after.statistics.tripleRookRolls = 2;
    after.statistics.tripleKingRolls = 3;
    expect(createProgressionOperation(before, after, "operation")?.payload).toMatchObject({
      tripleBishopRollsDelta: 1, tripleRookRollsDelta: 2, tripleKingRollsDelta: 3,
    });
  });

  it("keeps aggregation server-side and current-player scoped", () => {
    expect(migration).toContain("private.current_global_roulette_statistics(player.player_id)");
    expect(migration).toContain("private.current_player_id()");
    expect(migration).not.toContain("historical backfill");
    expect(migration).not.toContain("update private.player_multiplayer_statistics");
    expect(adapter).not.toContain("player_multiplayer_statistics");
    expect(migration).toContain("where player_id=target and triple_bishop_rolls=0");
  });
});
