import { describe, expect, it } from "vitest";

import { toPlayerId } from "../../src/application/players/PlayerContracts";
import { ACHIEVEMENT_DEFINITIONS as definitions } from "../../src/domain/achievements/AchievementCatalog";
import {
  evaluateCareerAchievement,
  evaluateCareerAchievements,
  evaluateSingleMatchAchievement,
  evaluateSingleMatchAchievements,
} from "../../src/domain/achievements/AchievementEvaluator";
import type {
  CareerAchievementSnapshot,
  SingleMatchAchievementSnapshot,
} from "../../src/domain/achievements/AchievementContracts";

const PLAYER_ID = toPlayerId("550e8400-e29b-41d4-a716-446655440000");
const pieces = (value = 0) => ({
  pawn: value, knight: value, bishop: value, rook: value, queen: value, king: value,
});

function career(overrides: Partial<CareerAchievementSnapshot> = {}): CareerAchievementSnapshot {
  return {
    singleplayer: { completedGames: 0, kingsCaptured: 0, bestWinStreak: 0, level: 1 },
    ranked: { completedGames: 0, wins: 0, bestWinStreak: 0, currentRating: 1000 },
    global: { rouletteRolls: 0, threeRightsTurns: 0, movesByPiece: pieces(), tripleRollsByPiece: pieces() },
    ...overrides,
  };
}

function match(overrides: Partial<SingleMatchAchievementSnapshot> = {}): SingleMatchAchievementSnapshot {
  return {
    matchId: "match-one",
    mode: "singleplayer",
    playerId: PLAYER_ID,
    playerColor: "white",
    status: "completed",
    terminationReason: "king-captured",
    winner: "white",
    valid: true,
    complete: true,
    playerSuccessfulMoves: 0,
    botSuccessfulMoves: 0,
    totalSuccessfulMoves: 0,
    promotedPawnIds: [],
    capturedEnemyPieces: 0,
    capturedOwnPieces: 0,
    pawnCaptures: 0,
    tripleRouletteResults: 0,
    currentConsecutiveThreeRightsTurns: 0,
    bestConsecutiveThreeRightsTurns: 0,
    terminalPlayerTurnMovesUsed: 0,
    finalOwnPieceCount: 16,
    ...overrides,
  };
}

describe("career achievement evaluator", () => {
  it.each([
    ["rookie_campaign", { singleplayer: { completedGames: 9, kingsCaptured: 0, bestWinStreak: 0, level: 1 } }, false],
    ["rookie_campaign", { singleplayer: { completedGames: 10, kingsCaptured: 0, bestWinStreak: 0, level: 1 } }, true],
    ["rookie_campaign", { singleplayer: { completedGames: 11, kingsCaptured: 0, bestWinStreak: 0, level: 1 } }, true],
    ["rating_climber", { ranked: { completedGames: 0, wins: 0, bestWinStreak: 0, currentRating: 1199 } }, false],
    ["rating_climber", { ranked: { completedGames: 0, wins: 0, bestWinStreak: 0, currentRating: 1200 } }, true],
    ["elite_player", { ranked: { completedGames: 0, wins: 0, bestWinStreak: 0, currentRating: 1499 } }, false],
    ["elite_player", { ranked: { completedGames: 0, wins: 0, bestWinStreak: 0, currentRating: 1500 } }, true],
    ["roulette_legend", { singleplayer: { completedGames: 0, kingsCaptured: 0, bestWinStreak: 0, level: 49 } }, false],
    ["roulette_legend", { singleplayer: { completedGames: 0, kingsCaptured: 0, bestWinStreak: 0, level: 50 } }, true],
  ] as const)("evaluates %s threshold boundaries", (id, override, eligible) => {
    expect(evaluateCareerAchievement(definitions[id], career(override)).eligible).toBe(eligible);
  });

  it("requires all six triple piece types for Triple Crown and sums all six for Triple Collector", () => {
    const five = { ...pieces(1), king: 0 };
    expect(evaluateCareerAchievement(definitions.triple_crown,
      career({ global: { rouletteRolls: 0, threeRightsTurns: 0, movesByPiece: pieces(), tripleRollsByPiece: five } })).eligible).toBe(false);
    expect(evaluateCareerAchievement(definitions.triple_crown,
      career({ global: { rouletteRolls: 0, threeRightsTurns: 0, movesByPiece: pieces(), tripleRollsByPiece: pieces(1) } })).eligible).toBe(true);

    const totals = { pawn: 20, knight: 20, bishop: 20, rook: 20, queen: 10, king: 10 };
    const evaluation = evaluateCareerAchievement(definitions.triple_collector,
      career({ global: { rouletteRolls: 0, threeRightsTurns: 0, movesByPiece: pieces(), tripleRollsByPiece: totals } }));
    expect(evaluation).toMatchObject({ eligible: true, progress: { current: 100 } });
  });

  it("distinguishes trustworthy zero from missing or invalid counters", () => {
    expect(evaluateCareerAchievement(definitions.rookie_campaign, career()).dataMissing).toBe(false);
    expect(evaluateCareerAchievement(definitions.rookie_campaign, {}).reason).toBe("missing-data");
    expect(evaluateCareerAchievement(definitions.rookie_campaign,
      { singleplayer: { completedGames: Number.NaN } }).reason).toBe("invalid-data");
    expect(evaluateCareerAchievement(definitions.triple_crown,
      { global: { tripleRollsByPiece: { pawn: 1 } } }).reason).toBe("missing-data");
  });

  it("keeps career and single-match scopes separate and normalizes visible progress", () => {
    expect(evaluateCareerAchievement(definitions.the_long_march, career())).toMatchObject({
      eligible: false, reason: "scope-mismatch",
    });
    const evaluation = evaluateCareerAchievement(definitions.hundred_games,
      career({ singleplayer: { completedGames: 25, kingsCaptured: 0, bestWinStreak: 0, level: 1 } }));
    expect(evaluation.progress).toMatchObject({ current: 25, target: 100, normalizedPercent: 25, displayProgress: true });
    expect(evaluateCareerAchievements(career())).toHaveLength(22);
  });
});

describe("single-match achievement evaluator", () => {
  it("uses both sides' successful moves for The Long March", () => {
    expect(evaluateSingleMatchAchievement(definitions.the_long_march,
      match({ playerSuccessfulMoves: 38, botSuccessfulMoves: 37, totalSuccessfulMoves: 75 })).eligible).toBe(true);
    expect(evaluateSingleMatchAchievement(definitions.the_long_march,
      match({ playerSuccessfulMoves: 37, botSuccessfulMoves: 37, totalSuccessfulMoves: 74 })).eligible).toBe(false);
    expect(evaluateSingleMatchAchievement(definitions.the_long_march,
      match({ playerSuccessfulMoves: 38, botSuccessfulMoves: 37, totalSuccessfulMoves: 76 })).reason).toBe("invalid-data");
  });

  it("counts distinct promoted pawn identities", () => {
    expect(evaluateSingleMatchAchievement(definitions.royal_ascension,
      match({ promotedPawnIds: ["pawn-a", "pawn-b", "pawn-c"] })).eligible).toBe(true);
    expect(evaluateSingleMatchAchievement(definitions.royal_ascension,
      match({ promotedPawnIds: ["pawn-a", "pawn-a", "pawn-b"] })).eligible).toBe(false);
  });

  it("requires a king-capture win for Last One Standing and includes the king capture", () => {
    expect(evaluateSingleMatchAchievement(definitions.last_one_standing,
      match({ capturedEnemyPieces: 12 })).eligible).toBe(true);
    expect(evaluateSingleMatchAchievement(definitions.last_one_standing,
      match({ capturedEnemyPieces: 12, terminationReason: "timeout" })).eligible).toBe(false);
    expect(evaluateSingleMatchAchievement(definitions.last_one_standing,
      match({ capturedEnemyPieces: 11 })).eligible).toBe(false);
  });

  it("accepts four triples regardless of playability metadata", () => {
    expect(evaluateSingleMatchAchievement(definitions.wheels_favor,
      match({ tripleRouletteResults: 4 })).eligible).toBe(true);
    expect(evaluateSingleMatchAchievement(definitions.wheels_favor,
      match({ tripleRouletteResults: 3 })).eligible).toBe(false);
  });

  it("locks Against All Odds to a king-capture win with at most three own pieces", () => {
    expect(evaluateSingleMatchAchievement(definitions.against_all_odds,
      match({ finalOwnPieceCount: 3 })).eligible).toBe(true);
    expect(evaluateSingleMatchAchievement(definitions.against_all_odds,
      match({ finalOwnPieceCount: 4 })).eligible).toBe(false);
    expect(evaluateSingleMatchAchievement(definitions.against_all_odds,
      match({ finalOwnPieceCount: 3, terminationReason: "timeout" })).eligible).toBe(false);
  });

  it("requires zero own losses and a king-capture win for Untouchable", () => {
    expect(evaluateSingleMatchAchievement(definitions.untouchable,
      match({ capturedOwnPieces: 0 })).eligible).toBe(true);
    expect(evaluateSingleMatchAchievement(definitions.untouchable,
      match({ capturedOwnPieces: 1 })).eligible).toBe(false);
    expect(evaluateSingleMatchAchievement(definitions.untouchable,
      match({ capturedOwnPieces: 0, terminationReason: "timeout" })).eligible).toBe(false);
  });

  it("attributes only captures made while the piece is a pawn", () => {
    expect(evaluateSingleMatchAchievement(definitions.pawn_rebellion,
      match({ pawnCaptures: 8, capturedEnemyPieces: 8 })).eligible).toBe(true);
    expect(evaluateSingleMatchAchievement(definitions.pawn_rebellion,
      match({ pawnCaptures: 7, capturedEnemyPieces: 8 })).eligible).toBe(false);
  });

  it("counts a terminal third move for Perfect Rhythm", () => {
    expect(evaluateSingleMatchAchievement(definitions.perfect_rhythm, match({
      currentConsecutiveThreeRightsTurns: 9,
      bestConsecutiveThreeRightsTurns: 9,
      terminalPlayerTurnMovesUsed: 3,
    }))).toMatchObject({ eligible: true, progress: { current: 10 } });
    expect(evaluateSingleMatchAchievement(definitions.perfect_rhythm, match({
      currentConsecutiveThreeRightsTurns: 9,
      bestConsecutiveThreeRightsTurns: 9,
      terminalPlayerTurnMovesUsed: 2,
    })).eligible).toBe(false);
  });

  it.each(["abandoned", "technical-abort"] as const)("rejects %s matches", (status) => {
    expect(evaluateSingleMatchAchievements(match({
      status,
      terminationReason: status,
      complete: false,
      winner: null,
    })).every((evaluation) => !evaluation.eligible && evaluation.reason === "match-not-completed")).toBe(true);
  });

  it("rejects multiplayer scope and never combines separate match snapshots", () => {
    expect(evaluateSingleMatchAchievements(match({ mode: "ranked-multiplayer" })))
      .toSatisfy((evaluations: readonly { eligible: boolean; reason?: string }[]) =>
        evaluations.every((item) => !item.eligible && item.reason === "scope-mismatch"));
    expect(evaluateSingleMatchAchievement(definitions.the_long_march,
      match({ matchId: "one", playerSuccessfulMoves: 20, botSuccessfulMoves: 20, totalSuccessfulMoves: 40 })).eligible).toBe(false);
    expect(evaluateSingleMatchAchievement(definitions.the_long_march,
      match({ matchId: "two", playerSuccessfulMoves: 20, botSuccessfulMoves: 20, totalSuccessfulMoves: 40 })).eligible).toBe(false);
  });

  it("is deterministic, does not mutate input and rejects invalid counters", () => {
    const snapshot = match({ tripleRouletteResults: 4 });
    const before = structuredClone(snapshot);
    const first = evaluateSingleMatchAchievements(snapshot);
    expect(evaluateSingleMatchAchievements(snapshot)).toEqual(first);
    expect(snapshot).toEqual(before);
    expect(evaluateSingleMatchAchievement(definitions.wheels_favor,
      match({ tripleRouletteResults: -1 })).reason).toBe("invalid-data");
    expect(evaluateSingleMatchAchievement(definitions.wheels_favor,
      match({ tripleRouletteResults: Number.NaN })).reason).toBe("invalid-data");
    expect(evaluateSingleMatchAchievement(definitions.wheels_favor,
      { ...match(), tripleRouletteResults: undefined }).reason).toBe("missing-data");
    expect(evaluateSingleMatchAchievement(definitions.wheels_favor,
      match({ valid: false })).reason).toBe("invalid-data");
  });
});
