import Game from "./Game";
import type { GameSetupInput } from "../types/GameSetup";

class GameManager {
  private game: Game;

  constructor() {
    this.game = new Game();
  }

  public getGame(): Game {
    return this.game;
  }

  public newGame(setup?: GameSetupInput): void {
    this.game.dispose();
    this.game = new Game(setup);
  }
}

export default new GameManager();
