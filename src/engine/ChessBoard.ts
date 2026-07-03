import type { Piece } from "../types/Chess";

export default class ChessBoard {

  public squares: (Piece | null)[][];

  constructor() {

    this.squares = Array.from(
      { length: 8 },
      () => Array(8).fill(null)
    );

    this.initialize();
  }

  private initialize() {

    const backRank = [
        "rook",
        "knight",
        "bishop",
        "queen",
        "king",
        "bishop",
        "knight",
        "rook"
    ] as const;

    for (let col = 0; col < 8; col++) {

        this.squares[0][col] = {
            id: crypto.randomUUID(),
            type: backRank[col],
            color: "black"
        };

        this.squares[1][col] = {
            id: crypto.randomUUID(),
            type: "pawn",
            color: "black"
        };

        this.squares[6][col] = {
            id: crypto.randomUUID(),
            type: "pawn",
            color: "white"
        };

        this.squares[7][col] = {
            id: crypto.randomUUID(),
            type: backRank[col],
            color: "white"
        };

      }

  }

}