import type { PieceColor } from "../types/Chess";
import type { BotDifficulty } from "../types/GameSetup";
import BotController, { type Bot } from "./BotController";
import BotTurnPlannerFactory from "./BotTurnPlannerFactory";

export default class BotFactory {
  public static create(
    color: PieceColor,
    difficulty: BotDifficulty = "hard",
    random: () => number = Math.random
  ): Bot {
    return new BotController(
      color,
      random,
      BotTurnPlannerFactory.create(difficulty)
    );
  }
}
