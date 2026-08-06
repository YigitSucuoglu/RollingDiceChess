import type { PieceColor } from "../types/Chess";
import type { BotDifficulty } from "../types/GameSetup";
import BotController, { type Bot } from "./BotController";
import BotTurnPlannerFactory from "./BotTurnPlannerFactory";
import type { RandomSource } from "../domain/contracts/PlatformPorts";

export default class BotFactory {
  public static create(
    color: PieceColor,
    difficulty: BotDifficulty = "hard",
    random?: RandomSource,
  ): Bot {
    return new BotController(
      color,
      random ?? Math.random,
      BotTurnPlannerFactory.create(difficulty)
    );
  }
}
