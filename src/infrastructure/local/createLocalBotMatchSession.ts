import LocalBotMatchSession from "../../application/matches/LocalBotMatchSession";
import type { LocalBotMatchConfiguration } from "../../domain/contracts/MatchContracts";
import Game from "../../engine/Game";
import playerProfileService from "../../profile/PlayerProfileService";
import type { GameSetup } from "../../types/GameSetup";
import { browserIdGenerator, javaScriptRandomSource, systemScheduler, systemTimeSource } from "./LocalPlatformAdapters";

export function toLocalBotMatchConfiguration(setup: GameSetup): LocalBotMatchConfiguration {
  return {
    schemaVersion: 1,
    mode: "bot",
    playerColor: setup.playerColor,
    botColor: setup.botColor,
    botDifficulty: setup.botDifficulty,
    timeControl: {
      id: setup.timeControl.id,
      initialMs: setup.timeControl.initialMinutes * 60_000,
      incrementMs: setup.timeControl.incrementSeconds * 1_000,
    },
    pieceSet: setup.pieceSet,
    boardTheme: setup.boardTheme,
  };
}

export function createLocalBotMatchSession(setup: GameSetup): LocalBotMatchSession {
  const profileSession = playerProfileService.createGameSession(setup);
  const game = new Game(setup, undefined, profileSession.eventSink, {
    idGenerator: browserIdGenerator,
    random: javaScriptRandomSource,
    scheduler: systemScheduler,
    timeSource: systemTimeSource,
  });
  return new LocalBotMatchSession(game, toLocalBotMatchConfiguration(setup), profileSession.getXpProgressionResult);
}
