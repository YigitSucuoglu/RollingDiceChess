import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_DEFINITIONS } from "../../src/domain/achievements/AchievementCatalog";
import { PROGRESS_ACHIEVEMENT_IDS, selectAchievementProgress } from "../../src/application/achievements/AchievementProgress";
import { createDefaultPlayerProfile } from "../../src/profile/PlayerProfile";
import type { CloudProfileSnapshot } from "../../src/profile/PlayerSync";

function snapshot(): CloudProfileSnapshot {
  const profile = createDefaultPlayerProfile();
  profile.statistics.gamesPlayed = 12;
  profile.statistics.kingsCaptured = 4;
  profile.statistics.rouletteRolls = 80;
  return {
    playerId: profile.playerId, profile, bootstrapApplied: false, multiplayerRating: 1000,
    multiplayerStatistics: { rating: 1000, rankedGames: 26, rankedWins: 2, rankedLosses: 24,
      rankedWinRate: 2 / 26, unrankedGames: 9, currentRankedWinStreak: 0, bestRankedWinStreak: 1,
      totalMultiplayerPlayTimeMs: 0, multiplayerKingsCaptured: 0, multiplayerRouletteRolls: 25 },
    rouletteStatistics: { mostRolledPiece: null, mostRolledPieceCount: 0,
      mostPlayedPiece: null, mostPlayedPieceCount: 0, threeRightsTurns: 0,
      playerTurnsCompleted: 0, threeRightsUsedRate: 0,
      tripleRolls: ["pawn", "knight", "bishop", "rook", "queen", "king"].map((pieceType, index) =>
        ({ pieceType: pieceType as "pawn", count: index + 1 })),
      movesByPiece: { pawn: 500, knight: 250, king: 100, bishop: 0, rook: 0, queen: 0 } },
  };
}

describe("selected canonical achievement progress", () => {
  it("selects exactly 15 of 30 catalog items without inferring unlocks", () => {
    const source = snapshot();
    const ids = Object.keys(ACHIEVEMENT_DEFINITIONS) as (keyof typeof ACHIEVEMENT_DEFINITIONS)[];
    expect(ids).toHaveLength(30);
    expect(new Set(PROGRESS_ACHIEVEMENT_IDS).size).toBe(15);
    expect(ids.filter((id) => selectAchievementProgress(id, source))).toHaveLength(15);
    expect(ids.filter((id) => !selectAchievementProgress(id, source))).toHaveLength(15);
    expect(selectAchievementProgress("rookie_campaign", source)).toMatchObject({ current: 12, target: 10, percent: 100 });
    expect(selectAchievementProgress("ranked_regular", source)?.current).toBe(26);
    expect(selectAchievementProgress("wheel_spinner", source)).toMatchObject({ current: 105, recordedOnly: true });
    expect(selectAchievementProgress("triple_collector", source)?.current).toBe(21);
    expect(selectAchievementProgress("pawn_commander", source)?.current).toBe(500);
    expect(selectAchievementProgress("knight_specialist", source)).toMatchObject({ current: 250, target: 500 });
    expect(selectAchievementProgress("royal_maneuvers", source)).toMatchObject({ current: 100, target: 500 });
    expect(selectAchievementProgress("untouchable", source)).toBeNull();
  });

  it("never substitutes missing or invalid counters with zero", () => {
    const source = snapshot();
    expect(selectAchievementProgress("rookie_campaign", { ...source,
      profile: { ...source.profile, statistics: { ...source.profile.statistics, gamesPlayed: Number.NaN } } })).toBeNull();
    expect(selectAchievementProgress("ranked_victor", { ...source,
      multiplayerStatistics: { ...source.multiplayerStatistics, rankedWins: -1 } })).toBeNull();
    expect(selectAchievementProgress("pawn_commander", { ...source,
      rouletteStatistics: { ...source.rouletteStatistics, movesByPiece: undefined } })).toBeNull();
    expect(selectAchievementProgress("rookie_campaign", null)).toBeNull();
  });
});
