import ChessBoard from "./ChessBoard";
import type { Position } from "../types/Chess";

export default class Game {
  public board: ChessBoard;

  public selectedSquare: Position | null;

  constructor() {
    this.board = new ChessBoard();
    this.selectedSquare = null;
  }
}