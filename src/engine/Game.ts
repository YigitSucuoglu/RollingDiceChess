import type { Move, Position } from "../types/Chess";
import ChessBoard from "./ChessBoard";
import MoveGenerator from "./MoveGenerator";
import type { PieceColor } from "../types/Chess";

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

    if (piece.color !== this.currentTurn) {
      return;
    }

    this.selectedSquare = { row, col };

    this.possibleMoves = MoveGenerator.generateMoves(
      this.board,
      row,
      col
    );
  }
  
  public currentTurn: PieceColor = "white";
  
  public makeMove(move: Move): void {
    const piece = this.board.squares[move.from.row][move.from.col];

    if (!piece) return;

    this.board.squares[move.to.row][move.to.col] = piece;
    this.board.squares[move.from.row][move.from.col] = null;

    this.selectedSquare = null;
    this.possibleMoves = [];

    this.currentTurn =
      this.currentTurn === "white"
        ? "black"
        : "white";
  }
}