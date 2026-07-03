import Game from "./Game";

class GameManager {
  private game: Game;

  constructor() {
    this.game = new Game();
  }

  public getGame(): Game {
    return this.game;
  }

  public newGame(): void {
    this.game = new Game();
  }
}

export default new GameManager();