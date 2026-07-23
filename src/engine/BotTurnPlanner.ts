import type { Move } from "../types/Chess";
import type Game from "./Game";

export interface BotTurnPlan {
  readonly moves: readonly Move[];
}

export interface BotTurnPlanner {
  planTurn(game: Game, random: () => number): BotTurnPlan | null;
}
