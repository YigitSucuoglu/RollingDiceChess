import type LocalBotMatchSession from "../application/matches/LocalBotMatchSession";
import { createDefaultGameSetup, normalizeGameSetup } from "../config/gameSetup";
import type Game from "../engine/Game";
import { createLocalBotMatchSession } from "../infrastructure/local/createLocalBotMatchSession";
import type { MatchXpProgressionResult } from "../profile/ProfileProgression";
import type { GameSetupInput } from "../types/GameSetup";

class GameManager {
  private session: LocalBotMatchSession;

  public constructor() {
    this.session = this.createSession();
  }

  public getGame(): Game {
    return this.session.game;
  }

  public getSession(): LocalBotMatchSession {
    return this.session;
  }

  public newGame(setup?: GameSetupInput): void {
    this.session.dispose();
    this.session = this.createSession(setup);
  }

  public getMatchXpProgression(game: Game = this.session.game): MatchXpProgressionResult | null {
    return game === this.session.game ? this.session.getMatchXpProgression() : null;
  }

  private createSession(setupInput?: GameSetupInput): LocalBotMatchSession {
    const setup = normalizeGameSetup(setupInput ?? createDefaultGameSetup());
    return createLocalBotMatchSession(setup);
  }
}

export default new GameManager();
