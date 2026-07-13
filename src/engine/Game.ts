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

    piece.hasMoved = true;

    if (move.isCastle) {

      // Kısa rok
      if (move.to.col === 6) {

        const rook = this.board.squares[move.from.row][7];

        if (rook) {
          this.board.squares[move.from.row][5] = rook;
          this.board.squares[move.from.row][7] = null;
          rook.hasMoved = true;
        }

      }

      // Uzun rok
      else if (move.to.col === 2) {

        const rook = this.board.squares[move.from.row][0];

        if (rook) {
          this.board.squares[move.from.row][3] = rook;
          this.board.squares[move.from.row][0] = null;
          rook.hasMoved = true;
        }

      }

    }

    this.selectedSquare = null;
    this.possibleMoves = [];

    this.currentTurn =
      this.currentTurn === "white"
        ? "black"
        : "white";
  }
}