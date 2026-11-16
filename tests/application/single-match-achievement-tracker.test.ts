import { describe, expect, it } from "vitest";

import { toPlayerId } from "../../src/application/players/PlayerContracts";
import SingleMatchAchievementTracker from "../../src/domain/achievements/SingleMatchAchievementTracker";
import type { GameCompletedEvent, GameMoveEvent, GameTurnEndedEvent } from "../../src/engine/GameEvents";

const configuration = {
  matchId: "match-one",
  playerId: toPlayerId("player-one"),
  playerColor: "white" as const,
};

const move = (overrides: Partial<GameMoveEvent> = {}): GameMoveEvent => ({
  eventId: 1,
  pieceId: "piece-one",
  color: "white",
  pieceType: "pawn",
  isCapture: false,
  isPromotion: false,
  ...overrides,
});

const turn = (overrides: Partial<GameTurnEndedEvent> = {}): GameTurnEndedEvent => ({
  eventId: 1,
  color: "white",
  movesUsed: 3,
  reason: "moves-exhausted",
  ...overrides,
});

const completed = (overrides: Partial<GameCompletedEvent> = {}): GameCompletedEvent => ({
  eventId: 1,
  winner: "white",
  reason: "king-captured",
  finalPieceCounts: { white: 3, black: 7 },
  ...overrides,
});

describe("SingleMatchAchievementTracker", () => {
  it("counts committed player/bot moves and capture ownership", () => {
    const tracker = new SingleMatchAchievementTracker(configuration);
    tracker.recordMove(move({ eventId: 1, isCapture: true }));
    tracker.recordMove(move({ eventId: 2, color: "black", pieceType: "rook", isCapture: true }));
    tracker.recordMove(move({ eventId: 3, pieceType: "queen" }));
    const snapshot = tracker.complete(completed());
    expect(snapshot).toMatchObject({
      playerSuccessfulMoves: 2,
      botSuccessfulMoves: 1,
      totalSuccessfulMoves: 3,
      capturedEnemyPieces: 1,
      capturedOwnPieces: 1,
      pawnCaptures: 1,
    });
  });

  it("uses capture-time type and stable pawn identity for promotions", () => {
    const tracker = new SingleMatchAchievementTracker(configuration);
    tracker.recordMove(move({ eventId: 1, pieceId: "pawn-a", isCapture: true, isPromotion: true }));
    tracker.recordMove(move({ eventId: 2, pieceId: "pawn-a", isPromotion: true }));
    tracker.recordMove(move({ eventId: 3, pieceId: "pawn-b", isPromotion: true }));
    tracker.recordMove(move({ eventId: 4, pieceId: "pawn-a", pieceType: "queen", isCapture: true }));
    const snapshot = tracker.complete(completed());
    expect(snapshot.promotedPawnIds).toEqual(["pawn-a", "pawn-b"]);
    expect(snapshot.pawnCaptures).toBe(1);
    expect(snapshot.capturedEnemyPieces).toBe(2);
  });

  it("counts only player triples and distinguishes identical real rolls by event ID", () => {
    const tracker = new SingleMatchAchievementTracker(configuration);
    tracker.recordRoll("white", ["pawn", "pawn", "pawn"], 1);
    tracker.recordRoll("white", ["pawn", "pawn", "pawn"], 1);
    tracker.recordRoll("white", ["pawn", "pawn", "pawn"], 2);
    tracker.recordRoll("black", ["queen", "queen", "queen"], 3);
    tracker.recordRoll("white", ["pawn", "knight", "pawn"], 4);
    expect(tracker.complete(completed()).tripleRouletteResults).toBe(2);
  });

  it("tracks full-right streaks, resets partial/skipped player turns and ignores bot turns", () => {
    const tracker = new SingleMatchAchievementTracker(configuration);
    tracker.recordTurnEnded(turn({ eventId: 1 }));
    tracker.recordTurnEnded(turn({ eventId: 2, color: "black", movesUsed: 0, reason: "skipped" }));
    tracker.recordTurnEnded(turn({ eventId: 3 }));
    tracker.recordTurnEnded(turn({ eventId: 3 }));
    tracker.recordTurnEnded(turn({ eventId: 4, movesUsed: 2 }));
    tracker.recordTurnEnded(turn({ eventId: 5 }));
    tracker.recordTurnEnded(turn({ eventId: 6, movesUsed: 0, reason: "skipped" }));
    const snapshot = tracker.complete(completed());
    expect(snapshot.currentConsecutiveThreeRightsTurns).toBe(0);
    expect(snapshot.bestConsecutiveThreeRightsTurns).toBe(2);
  });

  it("preserves the terminal third player move for evaluator completion", () => {
    const tracker = new SingleMatchAchievementTracker(configuration);
    for (let eventId = 1; eventId <= 9; eventId++) {
      tracker.recordTurnEnded(turn({ eventId }));
    }
    tracker.recordMove(move({ eventId: 10 }));
    tracker.recordMove(move({ eventId: 11 }));
    tracker.recordMove(move({ eventId: 12, isCapture: true }));
    expect(tracker.complete(completed())).toMatchObject({
      currentConsecutiveThreeRightsTurns: 9,
      bestConsecutiveThreeRightsTurns: 9,
      terminalPlayerTurnMovesUsed: 3,
    });
  });

  it("freezes one timeout snapshot and rejects later mutation", () => {
    const tracker = new SingleMatchAchievementTracker(configuration);
    tracker.recordMove(move());
    const first = tracker.complete(completed({
      winner: "black",
      reason: "timeout",
      finalPieceCounts: { white: 15, black: 16 },
    }));
    tracker.recordMove(move({ eventId: 2 }));
    const second = tracker.complete(completed({ eventId: 2 }));
    expect(second).toBe(first);
    expect(first).toMatchObject({
      status: "completed",
      terminationReason: "timeout",
      finalOwnPieceCount: 15,
      playerSuccessfulMoves: 1,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.promotedPawnIds)).toBe(true);
  });

  it("produces no snapshot for an abandoned match and new instances are isolated", () => {
    const abandoned = new SingleMatchAchievementTracker(configuration);
    abandoned.recordMove(move());
    abandoned.abort();
    expect(abandoned.getSnapshot()).toBeNull();
    expect(() => abandoned.complete(completed())).toThrow(/closed/);

    const rematch = new SingleMatchAchievementTracker({ ...configuration, matchId: "match-two" });
    expect(rematch.complete(completed())).toMatchObject({
      matchId: "match-two",
      totalSuccessfulMoves: 0,
      tripleRouletteResults: 0,
    });
  });
});
