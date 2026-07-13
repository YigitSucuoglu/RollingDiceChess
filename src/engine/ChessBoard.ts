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
  
  private createPiece(
    type: Piece["type"],
    color: Piece["color"]
  ): Piece {
    return {
      id: crypto.randomUUID(),
      type,
      color,
      hasMoved: false,
    };
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

        this.squares[0][col] =
          this.createPiece(backRank[col], "black");

        this.squares[1][col] =
          this.createPiece("pawn", "black");

        this.squares[6][col] =
            this.createPiece("pawn", "white");

        this.squares[7][col] =
            this.createPiece(backRank[col], "white");

      }

  }

}