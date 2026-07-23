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

  public clone(): ChessBoard {
    const clonedBoard = Object.create(ChessBoard.prototype) as ChessBoard;

    clonedBoard.squares = this.squares.map((row) =>
      row.map((piece) => piece
        ? {
            ...piece,
            initialPosition: { ...piece.initialPosition },
          }
        : null)
    );

    return clonedBoard;
  }
  
  private createPiece(
    type: Piece["type"],
    color: Piece["color"],
    row: number,
    col: number
  ): Piece {
    return {
      id: crypto.randomUUID(),
      type,
      color,
      hasMoved: false,
      initialPosition: { row, col },
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
          this.createPiece(backRank[col], "black", 0, col);

        this.squares[1][col] =
          this.createPiece("pawn", "black", 1, col);

        this.squares[6][col] =
            this.createPiece("pawn", "white", 6, col);

        this.squares[7][col] =
            this.createPiece(backRank[col], "white", 7, col);

      }

  }

}
