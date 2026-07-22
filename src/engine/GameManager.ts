import Game from "./Game";
import type { GameSetup } from "../types/GameSetup";

class GameManager {
  private game: Game;

  constructor() {
    this.game = new Game();
  }

  public getGame(): Game {
    return this.game;
  }

  public newGame(setup?: GameSetup): void {
    this.game.dispose();
    this.game = new Game(setup);
  }
}

export default new GameManager();
