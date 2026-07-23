import type { BotDifficulty } from "../types/GameSetup";
import type { BotTurnPlanner } from "./BotTurnPlanner";
import EasyTurnPlanner from "./EasyTurnPlanner";
import HardTurnPlanner from "./HardTurnPlanner";
import MediumTurnPlanner from "./MediumTurnPlanner";

export default class BotTurnPlannerFactory {
  public static create(difficulty: BotDifficulty): BotTurnPlanner {
    switch (difficulty) {
      case "easy":
        return new EasyTurnPlanner();
      case "medium":
        return new MediumTurnPlanner();
      case "hard":
        return new HardTurnPlanner();
    }
  }
}
