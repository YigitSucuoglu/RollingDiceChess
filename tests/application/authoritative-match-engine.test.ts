import { describe, expect, it } from "vitest";

import {
  advanceAuthoritativeUnplayableTurn,
  applyAuthoritativeMove,
  createAuthoritativeInitialState,
  getAuthoritativeSelectableMoves,
} from "../../src/application/multiplayer/AuthoritativeMatchEngine";
import type { AuthoritativeStoredState } from "../../src/application/multiplayer/AuthoritativeMatchEngine";
import type { Piece, PieceType } from "../../src/types/Chess";

const pawnRoll = () => 0;

function piece(id: string, type: PieceType, color: "white" | "black", row: number, col: number): Piece {
  return { id, type, color, hasMoved: false, initialPosition: { row, col } };
}

function sparseState(
  pieces: readonly { readonly row: number; readonly col: number; readonly value: Piece }[],
  right: PieceType,
  lastMove: AuthoritativeStoredState["lastMove"] = null,
): AuthoritativeStoredState {
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  for (const entry of pieces) board[entry.row][entry.col] = entry.value;
  return {
    schemaVersion: 1,
    board,
    currentTurn: "white",
    currentRoll: [right, right, right],
    remainingRights: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0, [right]: 1 },
    lastMove,
    winner: null,
    moveHistory: [{ turnNumber: 1, whiteMoves: [], blackMoves: [] }],
    historySequence: 0,
  };
}

describe("authoritative multiplayer match engine", () => {
  it("creates the board, roll and matching rights in the trusted runtime", () => {
    const state = createAuthoritativeInitialState(pawnRoll);
    expect(state.currentTurn).toBe("white");
    expect(state.currentRoll).toEqual(["pawn", "pawn", "pawn"]);
    expect(state.remainingRights.pawn).toBe(3);
    expect(state.board.flat().filter(Boolean)).toHaveLength(32);
  });

  it("accepts only a canonical selectable move without mutating the input state", () => {
    const state = createAuthoritativeInitialState(pawnRoll);
    const selected = getAuthoritativeSelectableMoves(state)[0];
    const originalSource = state.board[selected.from.row][selected.from.col];
    const result = applyAuthoritativeMove(state, selected.from, selected.to, pawnRoll);
    expect(state.board[selected.from.row][selected.from.col]).toBe(originalSource);
    expect(result.state.board[selected.from.row][selected.from.col]).toBeNull();
    expect(result.state.board[selected.to.row][selected.to.col]?.id).toBe(selected.pieceId);
    expect(result.state.remainingRights.pawn).toBe(2);
    expect(result.state.moveHistory[0].whiteMoves).toHaveLength(1);
  });

  it("rejects a coordinate pair outside the maximum-continuation legal set", () => {
    const state = createAuthoritativeInitialState(pawnRoll);
    expect(() => applyAuthoritativeMove(
      state,
      { row: 7, col: 0 },
      { row: 5, col: 0 },
      pawnRoll,
    )).toThrow("not legal");
  });

  it("does not allow an unplayable-turn intent when legal moves exist", () => {
    const state = createAuthoritativeInitialState(pawnRoll);
    expect(() => advanceAuthoritativeUnplayableTurn(state, pawnRoll)).toThrow("playable moves");
  });

  it("preserves three-right progression and creates the next automatic roll", () => {
    let state = createAuthoritativeInitialState(pawnRoll);
    for (let index = 0; index < 3; index++) {
      const move = getAuthoritativeSelectableMoves(state)[0];
      const result = applyAuthoritativeMove(state, move.from, move.to, pawnRoll);
      state = result.state;
      if (index < 2) expect(result.turnCompleted).toBe(false);
      else expect(result.turnCompleted).toBe(true);
    }
    expect(state.currentTurn).toBe("black");
    expect(state.currentRoll).toEqual(["pawn", "pawn", "pawn"]);
    expect(state.remainingRights.pawn).toBe(3);
  });

  it("advances an actually unplayable roll through the authoritative path", () => {
    const state = createAuthoritativeInitialState(pawnRoll);
    const blockedKingState: AuthoritativeStoredState = {
      ...state,
      currentRoll: ["king", "king", "king"],
      remainingRights: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 3 },
    };
    expect(getAuthoritativeSelectableMoves(blockedKingState)).toHaveLength(0);
    expect(advanceAuthoritativeUnplayableTurn(blockedKingState, pawnRoll).currentTurn).toBe("black");
  });

  it("applies castling, en passant and promotion with the shared engine", () => {
    const castle = sparseState([
      { row: 7, col: 4, value: piece("wk", "king", "white", 7, 4) },
      { row: 7, col: 7, value: piece("wr", "rook", "white", 7, 7) },
      { row: 0, col: 4, value: piece("bk", "king", "black", 0, 4) },
    ], "king");
    const castled = applyAuthoritativeMove(castle, { row: 7, col: 4 }, { row: 7, col: 6 }, pawnRoll).state;
    expect(castled.board[7][5]?.id).toBe("wr");

    const previousDouble = {
      pieceId: "bp", from: { row: 1, col: 5 }, to: { row: 3, col: 5 },
      isCapture: false, isCastle: false, isPromotion: false, isEnPassant: false,
    };
    const enPassant = sparseState([
      { row: 3, col: 4, value: piece("wp", "pawn", "white", 6, 4) },
      { row: 3, col: 5, value: { ...piece("bp", "pawn", "black", 1, 5), hasMoved: true } },
      { row: 7, col: 4, value: piece("wk", "king", "white", 7, 4) },
      { row: 0, col: 4, value: piece("bk", "king", "black", 0, 4) },
    ], "pawn", previousDouble);
    const captured = applyAuthoritativeMove(enPassant, { row: 3, col: 4 }, { row: 2, col: 5 }, pawnRoll).state;
    expect(captured.board[3][5]).toBeNull();

    const promotion = sparseState([
      { row: 1, col: 0, value: { ...piece("wp", "pawn", "white", 6, 0), hasMoved: true } },
      { row: 7, col: 4, value: piece("wk", "king", "white", 7, 4) },
      { row: 0, col: 4, value: piece("bk", "king", "black", 0, 4) },
    ], "pawn");
    const promoted = applyAuthoritativeMove(promotion, { row: 1, col: 0 }, { row: 0, col: 0 }, pawnRoll).state;
    expect(promoted.board[0][0]?.type).toBe("queen");
  });
});
