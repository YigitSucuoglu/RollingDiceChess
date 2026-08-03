import { describe, expect, it } from "vitest";
import DiceEngine from "../../src/engine/DiceEngine";
import EasyTurnPlanner from "../../src/engine/EasyTurnPlanner";
import MediumTurnPlanner from "../../src/engine/MediumTurnPlanner";
import HardTurnPlanner from "../../src/engine/HardTurnPlanner";
import Game from "../../src/engine/Game";

describe("deterministic dice and bot invariants", () => {
  it("maps an injected RNG deterministically without changing production randomness", () => {
    const values = [0, 0.5, 0.999]; let index = 0;
    expect(new DiceEngine(() => values[index++]).roll()).toEqual(["pawn", "rook", "king"]);
    expect(() => new DiceEngine(() => 1).roll()).toThrow(RangeError);
  });

  it.each([
    ["easy", new EasyTurnPlanner()],
    ["medium", new MediumTurnPlanner()],
    ["hard", new HardTurnPlanner()],
  ] as const)("%s planner returns only resolver-approved moves without mutating live state", (_name, planner) => {
    const game = new Game();
    game.turnRights.set("pawn", 3);
    for (const type of ["knight", "bishop", "rook", "queen", "king"] as const) game.turnRights.set(type, 0);
    const before = JSON.stringify(game.board.squares);
    const approved = game.getSelectableMoves();
    const plan = planner.planTurn(game, () => 0);
    expect(plan).not.toBeNull();
    for (const move of plan!.moves) expect(approved.some((candidate) => candidate.pieceId === move.pieceId && candidate.to.row === move.to.row && candidate.to.col === move.to.col)).toBe(true);
    expect(JSON.stringify(game.board.squares)).toBe(before);
    game.dispose();
  });
});
