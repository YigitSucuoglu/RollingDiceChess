import type Game from "./Game";
import type { PieceColor } from "../types/Chess";

export interface Bot {
  readonly color: PieceColor;

  playTurn(game: Game): void;
}

export default class BotController implements Bot {
  public readonly color: PieceColor;

  constructor(color: PieceColor) {
    this.color = color;
  }

  public playTurn(game: Game): void {
    void game;
  }
}
