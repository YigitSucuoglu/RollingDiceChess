import type { PieceType } from "../types/Chess.js";
import TurnRights from "./TurnRights.js";
import type { RandomSource } from "../domain/contracts/PlatformPorts.js";

const PIECE_TYPES: readonly PieceType[] = [
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
  "king",
];

export default class DiceEngine {
  private readonly random: () => number;

  constructor(random?: RandomSource) {
    this.random = random ?? Math.random;
  }

  public roll(): readonly [PieceType, PieceType, PieceType] {
    return [
      this.rollPieceType(),
      this.rollPieceType(),
      this.rollPieceType(),
    ];
  }

  public rollRights(): TurnRights {
    const rights = new TurnRights();

    for (const pieceType of this.roll()) {
      rights.set(pieceType, rights.get(pieceType) + 1);
    }

    return rights;
  }

  private rollPieceType(): PieceType {
    const value = this.random();

    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Random source must return a value in [0, 1).");
    }

    const index = Math.floor(value * PIECE_TYPES.length);

    return PIECE_TYPES[index];
  }
}
