import Game from "./Game";
import type { GameSetupInput } from "../types/GameSetup";
import {
  createDefaultGameSetup,
  normalizeGameSetup,
} from "../config/gameSetup";
import playerProfileService from "../profile/PlayerProfileService";
import type {
  MatchXpProgressionResult,
} from "../profile/ProfileProgression";
import type { ProfileGameSession } from "../profile/PlayerProfileService";

class GameManager {
  private game: Game;

  private readonly profileSessions: WeakMap<Game, ProfileGameSession>;

  constructor() {
    this.profileSessions = new WeakMap();
    this.game = this.createGame();
  }

  public getGame(): Game {
    return this.game;
  }

  public newGame(setup?: GameSetupInput): void {
    this.game.dispose();
    this.game = this.createGame(setup);
  }

  public getMatchXpProgression(
    game: Game = this.game
  ): MatchXpProgressionResult | null {
    return (
      this.profileSessions.get(game)?.getXpProgressionResult() ?? null
    );
  }

  private createGame(setupInput?: GameSetupInput): Game {
    const setup = normalizeGameSetup(
      setupInput ?? createDefaultGameSetup()
    );

    const profileSession = playerProfileService.createGameSession(setup);
    const game = new Game(
      setup,
      undefined,
      profileSession.eventSink
    );
    this.profileSessions.set(game, profileSession);

    return game;
  }
}

export default new GameManager();
