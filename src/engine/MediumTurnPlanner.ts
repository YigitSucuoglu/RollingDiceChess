import type { BotTurnPlan, BotTurnPlanner } from "./BotTurnPlanner";
import type Game from "./Game";
import HeuristicMoveSelector from "./HeuristicMoveSelector";

export default class MediumTurnPlanner implements BotTurnPlanner {
  private readonly moveSelector: HeuristicMoveSelector;

  constructor(
    moveSelector: HeuristicMoveSelector = new HeuristicMoveSelector()
  ) {
    this.moveSelector = moveSelector;
  }

  public planTurn(game: Game, random: () => number): BotTurnPlan | null {
    const selectableMoves = game.getSelectableMoves();

    if (selectableMoves.length === 0) {
      return null;
    }

    return {
      moves: [this.moveSelector.selectMove(selectableMoves, game.board, random)],
    };
  }
}
