import { describe, expect, it } from "vitest";
import MoveGenerator from "../../src/engine/MoveGenerator";
import { applySimulatedMove } from "../../src/engine/Simulation";
import { destinations, emptyBoard, put, state } from "./helpers";

describe("MoveGenerator", () => {
  it("covers pawn advances, blockers, captures and promotion flags", () => {
    const board = emptyBoard();
    const pawn = put(board, "pawn", "white", 6, 3);
    expect(destinations(MoveGenerator.generateMoves(board, 6, 3, null))).toEqual(["4,3", "5,3"]);
    put(board, "pawn", "white", 5, 3);
    expect(MoveGenerator.generateMoves(board, 6, 3, null)).toEqual([]);
    board.squares[5][3] = null;
    put(board, "rook", "black", 5, 2);
    put(board, "rook", "black", 5, 3);
    expect(destinations(MoveGenerator.generateMoves(board, 6, 3, null))).toEqual(["5,2"]);
    board.squares = emptyBoard().squares;
    board.squares[1][3] = pawn;
    const promotion = MoveGenerator.generateMoves(board, 1, 3, null).find((move) => move.to.row === 0)!;
    expect(promotion.isPromotion).toBe(true);
  });

  it("covers knight boundaries, friendly squares and captures", () => {
    const board = emptyBoard();
    put(board, "knight", "white", 0, 0);
    put(board, "pawn", "white", 1, 2);
    put(board, "pawn", "black", 2, 1);
    const moves = MoveGenerator.generateMoves(board, 0, 0, null);
    expect(destinations(moves)).toEqual(["2,1"]);
    expect(moves[0].isCapture).toBe(true);
  });

  it.each([
    ["bishop", ["2,2", "2,4", "4,2", "4,4"]],
    ["rook", ["2,3", "3,2", "3,4", "4,3"]],
    ["queen", ["2,2", "2,3", "2,4", "3,2", "3,4", "4,2", "4,3", "4,4"]],
    ["king", ["2,2", "2,3", "2,4", "3,2", "3,4", "4,2", "4,3", "4,4"]],
  ] as const)("generates %s movement", (type, immediate) => {
    const board = emptyBoard();
    put(board, type, "white", 3, 3, true);
    const moves = MoveGenerator.generateMoves(board, 3, 3, null);
    for (const square of immediate) expect(destinations(moves)).toContain(square);
  });

  it("stops sliders at blockers and captures only the enemy blocker", () => {
    const board = emptyBoard();
    put(board, "rook", "white", 4, 4);
    put(board, "pawn", "white", 4, 2);
    put(board, "pawn", "black", 4, 6);
    expect(destinations(MoveGenerator.generateMoves(board, 4, 4, null)).filter((x) => x.startsWith("4,"))).toEqual(["4,3", "4,5", "4,6"]);
  });

  it("generates and executes castling without attacked-square rules", () => {
    const board = emptyBoard();
    put(board, "king", "white", 7, 4);
    put(board, "rook", "white", 7, 0);
    put(board, "rook", "white", 7, 7);
    put(board, "rook", "black", 0, 5);
    const castles = MoveGenerator.generateMoves(board, 7, 4, null).filter((move) => move.isCastle);
    expect(destinations(castles)).toEqual(["7,2", "7,6"]);
    const next = applySimulatedMove(state(board, ["king", "rook"]), castles.find((m) => m.to.col === 6)!);
    expect(next.board.squares[7][5]?.type).toBe("rook");
    expect(next.board.squares[7][7]).toBeNull();
  });

  it("validates and executes en passant only from the matching last double move", () => {
    const board = emptyBoard();
    const white = put(board, "pawn", "white", 3, 3, true);
    const black = put(board, "pawn", "black", 3, 4, true);
    const lastMove = { from: { row: 1, col: 4 }, to: { row: 3, col: 4 }, isCapture: false, isCastle: false, isPromotion: false, isEnPassant: false, pieceId: black.id };
    const move = MoveGenerator.generateMoves(board, 3, 3, lastMove).find((candidate) => candidate.isEnPassant)!;
    expect(move.pieceId).toBe(white.id);
    const initial = state(board, ["pawn"]); initial.lastMove = lastMove;
    const next = applySimulatedMove(initial, move);
    expect(next.board.squares[3][4]).toBeNull();
    expect(MoveGenerator.generateMoves(board, 3, 3, { ...lastMove, pieceId: "wrong" }).some((candidate) => candidate.isEnPassant)).toBe(false);
  });

  it("promotes a pawn to queen in simulation", () => {
    const board = emptyBoard();
    put(board, "pawn", "white", 1, 0);
    const move = MoveGenerator.generateMoves(board, 1, 0, null)[0];
    expect(applySimulatedMove(state(board, ["pawn"]), move).board.squares[0][0]?.type).toBe("queen");
  });
});
