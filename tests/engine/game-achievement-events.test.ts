import { describe, expect, it, vi } from "vitest";

import Game from "../../src/engine/Game";
import type { GameEventSink } from "../../src/engine/GameEvents";
import type { PieceType } from "../../src/types/Chess";

function sink() {
  const order: string[] = [];
  const value: GameEventSink = {
    onRoll: vi.fn(() => order.push("roll")),
    onMove: vi.fn(() => order.push("move")),
    onTurnCompleted: vi.fn(() => order.push("legacy-turn")),
    onTurnEnded: vi.fn(() => order.push("turn-ended")),
    onGameCompleted: vi.fn(() => order.push("game-completed")),
  };
  return { value, order };
}

function setRights(game: Game, entries: Partial<Record<PieceType, number>>): void {
  for (const type of ["pawn", "knight", "bishop", "rook", "queen", "king"] as const) {
    game.turnRights.set(type, entries[type] ?? 0);
  }
}

describe("Game achievement event foundation", () => {
  it("emits one monotonic roll identity per real engine turn", () => {
    const events = sink();
    const game = new Game(undefined, undefined, events.value);
    expect(events.value.onRoll).toHaveBeenCalledTimes(1);
    expect(events.value.onRoll).toHaveBeenLastCalledWith("white", game.currentRoll, 1);
    setRights(game, { queen: 3 });
    for (const piece of game.board.squares.flat()) {
      if (piece?.color === "white" && piece.type === "queen") piece.type = "pawn";
    }
    game.skipUnplayableTurn();
    expect(events.value.onRoll).toHaveBeenCalledTimes(2);
    expect(vi.mocked(events.value.onRoll).mock.calls[1][2]).toBe(2);
    game.dispose();
  });

  it("emits stable piece identity after a successful committed move", () => {
    const events = sink();
    const game = new Game(undefined, undefined, events.value);
    setRights(game, { pawn: 1 });
    const selected = game.getSelectableMoves().find((move) => move.from.row === 6)!;
    game.makeMove(selected);
    expect(events.value.onMove).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 1,
      pieceId: selected.pieceId,
      pieceType: "pawn",
    }));
    game.dispose();
  });

  it("preserves pawn ID and capture-time pawn type through promotion", () => {
    const events = sink();
    const game = new Game(undefined, undefined, events.value);
    game.board.squares = Array.from({ length: 8 }, () => Array(8).fill(null));
    game.board.squares[1][0] = {
      id: "promoting-pawn", type: "pawn", color: "white", hasMoved: true,
      initialPosition: { row: 6, col: 0 },
    };
    game.board.squares[0][1] = {
      id: "target", type: "rook", color: "black", hasMoved: true,
      initialPosition: { row: 0, col: 1 },
    };
    setRights(game, { pawn: 1 });
    const promotion = game.getSelectableMoves().find((candidate) => candidate.to.col === 1)!;
    game.makeMove(promotion);
    expect(game.board.squares[0][1]).toMatchObject({ id: "promoting-pawn", type: "queen" });
    expect(events.value.onMove).toHaveBeenCalledWith(expect.objectContaining({
      pieceId: "promoting-pawn", pieceType: "pawn", isCapture: true, isPromotion: true,
    }));
    game.dispose();
  });

  it("emits one skipped turn end with zero moves and no legacy completion", () => {
    const events = sink();
    const game = new Game(undefined, undefined, events.value);
    setRights(game, { queen: 3 });
    for (const piece of game.board.squares.flat()) {
      if (piece?.color === "white" && piece.type === "queen") piece.type = "pawn";
    }
    expect(game.skipUnplayableTurn()).toBe(true);
    expect(events.value.onTurnEnded).toHaveBeenCalledTimes(1);
    expect(events.value.onTurnEnded).toHaveBeenCalledWith({
      eventId: 1, color: "white", movesUsed: 0, reason: "skipped",
    });
    expect(events.value.onTurnCompleted).not.toHaveBeenCalled();
    game.dispose();
  });

  it("orders terminal move before completion without a duplicate turn end", () => {
    const events = sink();
    const game = new Game(undefined, undefined, events.value);
    game.board.squares = Array.from({ length: 8 }, () => Array(8).fill(null));
    game.board.squares[4][4] = {
      id: "rook", type: "rook", color: "white", hasMoved: true,
      initialPosition: { row: 4, col: 4 },
    };
    game.board.squares[4][7] = {
      id: "king", type: "king", color: "black", hasMoved: true,
      initialPosition: { row: 4, col: 7 },
    };
    setRights(game, { rook: 1 });
    game.makeMove(game.getSelectableMoves().find((candidate) => candidate.to.col === 7)!);
    expect(events.order.slice(-2)).toEqual(["move", "game-completed"]);
    expect(events.value.onTurnEnded).not.toHaveBeenCalled();
    expect(events.value.onGameCompleted).toHaveBeenCalledWith(expect.objectContaining({
      finalPieceCounts: { white: 1, black: 0 },
    }));
    game.dispose();
  });
});
