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

    this.squares[0][0] = {
      id: crypto.randomUUID(),
      type: "rook",
      color: "black"
    };

    this.squares[0][7] = {
      id: crypto.randomUUID(),
      type: "rook",
      color: "black"
    };

  }

}