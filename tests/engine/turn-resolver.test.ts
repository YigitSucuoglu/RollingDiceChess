import { describe, expect, it } from "vitest";
import TurnResolver from "../../src/engine/TurnResolver";
import { emptyBoard, put, state } from "./helpers";

describe("TurnResolver maximum continuation", () => {
  it("allows one physical knight to consume three duplicate rights", () => {
    const board = emptyBoard(); put(board, "knight", "white", 4, 4);
    expect(new TurnResolver().resolve(state(board, ["knight", "knight", "knight"])).maxConsumableRights).toBe(3);
  });

  it("ignores unavailable piece types but preserves usable rights", () => {
    const board = emptyBoard(); put(board, "rook", "white", 4, 4);
    const result = new TurnResolver().resolve(state(board, ["queen", "rook"]));
    expect(result.maxConsumableRights).toBe(1);
    expect(result.selectableMoves.every((move) => move.pieceId === board.squares[4][4]?.id)).toBe(true);
  });

  it("retains all tied moves when only one right can be consumed", () => {
    const board = emptyBoard(); put(board, "king", "white", 4, 4, true);
    const result = new TurnResolver().resolve(state(board, ["king", "rook"]));
    expect(result.maxConsumableRights).toBe(1);
    expect(result.selectableMoves).toHaveLength(8);
  });

  it("keeps exposed-own-king moves legal and enemy king captures selectable but not mandatory", () => {
    const board = emptyBoard();
    const rook = put(board, "rook", "white", 4, 4);
    put(board, "king", "white", 4, 0);
    put(board, "king", "black", 4, 7);
    const moves = new TurnResolver().resolve(state(board, ["rook"])).selectableMoves;
    expect(moves.some((move) => move.pieceId === rook.id && move.to.col === 7)).toBe(true);
    expect(moves.some((move) => move.pieceId === rook.id && move.to.row !== 4)).toBe(true);
  });

  it("castling consumes only king right and allows relocated rook continuation", () => {
    const board = emptyBoard(); put(board, "king", "white", 7, 4); put(board, "rook", "white", 7, 7);
    const resolver = new TurnResolver();
    const initial = state(board, ["king", "rook"]);
    const castle = resolver.resolve(initial).selectableMoves.find((move) => move.isCastle)!;
    const child = resolver.createContinuationState(initial, castle);
    expect(child.rights.get("king")).toBe(0);
    expect(child.rights.get("rook")).toBe(1);
    expect(resolver.resolve(child).maxConsumableRights).toBe(1);
  });
});
