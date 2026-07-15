import type { Move, Position } from "../types/Chess";
import ChessBoard from "./ChessBoard";
import type { PieceColor } from "../types/Chess";
import TurnRights from "./TurnRights";
import { createSimulationState } from "./Simulation";
import TurnResolver, { type TurnResolution } from "./TurnResolver";

export default class Game {
  public board: ChessBoard;

  public selectedSquare: Position | null;

  public possibleMoves: Move[];

  public lastMove: Move | null;

  public winner: PieceColor | null;

  public turnRights!: TurnRights;

  private turnResolver: TurnResolver;


  constructor() {
    this.board = new ChessBoard();
    this.selectedSquare = null;
    this.possibleMoves = [];
    this.lastMove = null;
    this.winner = null;
    this.turnResolver = new TurnResolver();
    this.initializeTurnRights();
  }

  public selectSquare(row: number, col: number): void {
    
    if (this.winner) {
        return;
    }
    
    const piece = this.board.squares[row][col];

    if (!piece) return;

    if (piece.color !== this.currentTurn) {
      return;
    }
    
    if (!this.turnRights.has(piece.type)) {
        return;
    }

    const resolution = this.getTurnResolution();
    const approvedMoves = resolution.selectableMoves.filter(
      (move) =>
        move.from.row === row &&
        move.from.col === col &&
        move.pieceId === piece.id
    );

    if (approvedMoves.length === 0) {
      this.selectedSquare = null;
      this.possibleMoves = [];
      return;
    }

    this.selectedSquare = { row, col };
    this.possibleMoves = approvedMoves;
  }
  
  public currentTurn: PieceColor = "white";
  
  public makeMove(move: Move): void {
    const resolution = this.getTurnResolution();
    const isApproved = resolution.selectableMoves.some(
      (approvedMove) =>
        approvedMove.pieceId === move.pieceId &&
        approvedMove.from.row === move.from.row &&
        approvedMove.from.col === move.from.col &&
        approvedMove.to.row === move.to.row &&
        approvedMove.to.col === move.to.col &&
        approvedMove.isCapture === move.isCapture &&
        approvedMove.isCastle === move.isCastle &&
        approvedMove.isPromotion === move.isPromotion &&
        approvedMove.isEnPassant === move.isEnPassant
    );

    if (!isApproved) {
      return;
    }

    const piece = this.board.squares[move.from.row][move.from.col];
    const capturedPiece = this.board.squares[move.to.row][move.to.col];

    if (!piece) return;

    this.board.squares[move.to.row][move.to.col] = piece;
    this.board.squares[move.from.row][move.from.col] = null;

    piece.hasMoved = true;

    this.turnRights.consume(piece.type);

    if (move.isEnPassant) {
      const capturedRow =
        piece.color === "white"
          ? move.to.row + 1
          : move.to.row - 1;

      this.board.squares[capturedRow][move.to.col] = null;
    }

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

    if (
      piece.type === "pawn" &&
      (
        (piece.color === "white" && move.to.row === 0) ||
        (piece.color === "black" && move.to.row === 7)
      )
    ) {
      piece.type = "queen";
    }    



    this.lastMove = move;

    if (capturedPiece?.type === "king") {
      this.winner = piece.color;
    }

    this.selectedSquare = null;
    this.possibleMoves = [];

    if (this.winner) {
      return;
    }

    if (!this.turnRights.hasAnyRights()) {

      this.currentTurn =
        this.currentTurn === "white"
          ? "black"
          : "white";
      this.initializeTurnRights();
    }   
  }

  private initializeTurnRights(): void {

    this.turnRights = new TurnRights();

    this.turnRights.set("pawn", 2);
    this.turnRights.set("knight", 1);

  }

  private getTurnResolution(): TurnResolution {
    const state = createSimulationState(this);

    return this.turnResolver.resolve(state);
  }

}
