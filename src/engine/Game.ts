import ChessBoard from "./ChessBoard";

export default class Game {
  public board: ChessBoard;

  constructor() {
    this.board = new ChessBoard();
  }
}