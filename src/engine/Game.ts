import type { Move, Position } from "../types/Chess";
import ChessBoard from "./ChessBoard";
import MoveGenerator from "./MoveGenerator";

export default class Game {
  public board: ChessBoard;

  public selectedSquare: Position | null;

  public possibleMoves: Move[];

  constructor() {
    this.board = new ChessBoard();
    this.selectedSquare = null;
    this.possibleMoves = [];
  }

  public selectSquare(row: number, col: number): void {
    const piece = this.board.squares[row][col];

    if (!piece) return;

    this.selectedSquare = { row, col };

    this.possibleMoves = MoveGenerator.generateMoves(
      this.board,
      row,
      col
    );
  }
}