import type { PieceType } from "../types/Chess";
import TurnRights from "./TurnRights";

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

  constructor(random: () => number = Math.random) {
    this.random = random;
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
