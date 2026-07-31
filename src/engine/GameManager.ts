import Game from "./Game";
import type { GameSetupInput } from "../types/GameSetup";
import {
  createDefaultGameSetup,
  normalizeGameSetup,
} from "../config/gameSetup";
import playerProfileService from "../profile/PlayerProfileService";

class GameManager {
  private game: Game;

  constructor() {
    this.game = this.createGame();
  }

  public getGame(): Game {
    return this.game;
  }

  public newGame(setup?: GameSetupInput): void {
    this.game.dispose();
    this.game = this.createGame(setup);
  }

  private createGame(setupInput?: GameSetupInput): Game {
    const setup = normalizeGameSetup(
      setupInput ?? createDefaultGameSetup()
    );

    return new Game(
      setup,
      undefined,
      playerProfileService.createGameEventSink(setup)
    );
  }
}

export default new GameManager();
