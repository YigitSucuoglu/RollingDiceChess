import { describe, expect, it, vi } from "vitest";
import Game from "../../src/engine/Game";
import type { PieceType } from "../../src/types/Chess";

function setRights(game: Game, entries: Partial<Record<PieceType, number>>): void {
  for (const type of ["pawn", "knight", "bishop", "rook", "queen", "king"] as const) {
    game.turnRights.set(type, entries[type] ?? 0);
  }
}

describe("Game flow", () => {
  it("keeps currentRoll stable while rights decrease and history remains ordered", () => {
    const game = new Game();
    setRights(game, { pawn: 2 });
    const roll = game.currentRoll;
    const first = game.getSelectableMoves().find((move) => move.from.row === 6 && move.from.col === 0 && move.to.row === 5)!;
    game.makeMove(first);
    expect(game.currentRoll).toBe(roll);
    expect(game.turnRights.get("pawn")).toBe(1);
    expect(game.moveHistory.getSnapshot()[0].whiteMoves[0].notation).toBe("a3");
    const second = game.getSelectableMoves().find((move) => move.pieceId === first.pieceId)!;
    game.makeMove(second);
    expect(game.currentTurn).toBe("black");
    expect(game.moveHistory.getSnapshot()[0].whiteMoves.map((move) => move.timestamp)).toEqual([1, 2]);
    game.dispose();
  });

  it("skips one unplayable turn and creates exactly one next-turn roll", () => {
    const game = new Game();
    const previousRoll = game.currentRoll;
    setRights(game, { queen: 3 });
    game.board.squares.flat().forEach((piece) => { if (piece?.color === "white" && piece.type === "queen") piece.type = "pawn"; });
    expect(game.hasPlayableMoves()).toBe(false);
    expect(game.skipUnplayableTurn()).toBe(true);
    expect(game.currentTurn).toBe("black");
    expect(game.currentRoll).not.toBe(previousRoll);
    game.dispose();
  });

  it("records king-capture winner and rejects later moves", () => {
    const game = new Game();
    game.board.squares = Array.from({ length: 8 }, () => Array(8).fill(null));
    const rook = { id: "rook", type: "rook" as const, color: "white" as const, hasMoved: true, initialPosition: { row: 4, col: 4 } };
    game.board.squares[4][4] = rook;
    game.board.squares[4][7] = { id: "king", type: "king", color: "black", hasMoved: true, initialPosition: { row: 4, col: 7 } };
    setRights(game, { rook: 1 });
    const capture = game.getSelectableMoves().find((move) => move.to.col === 7)!;
    game.makeMove(capture);
    expect(game.winner).toBe("white");
    expect(game.resultReason).toBe("king-captured");
    const snapshot = JSON.stringify(game.board.squares);
    game.makeMove(capture);
    expect(JSON.stringify(game.board.squares)).toBe(snapshot);
    game.dispose();
  });

  it("new Game creates clean independent state", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `id-${Math.random()}`) });
    const first = new Game();
    first.board.squares[6][0] = null;
    const second = new Game();
    expect(second.board.squares[6][0]?.type).toBe("pawn");
    expect(second.moveHistory.getSnapshot()[0].whiteMoves).toHaveLength(0);
    first.dispose(); second.dispose();
    vi.unstubAllGlobals();
  });
});
