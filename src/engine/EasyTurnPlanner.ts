import type { BotTurnPlan, BotTurnPlanner } from "./BotTurnPlanner";
import type Game from "./Game";
import RandomMoveSelector from "./RandomMoveSelector";

export default class EasyTurnPlanner implements BotTurnPlanner {
  private readonly moveSelector: RandomMoveSelector;

  constructor(moveSelector: RandomMoveSelector = new RandomMoveSelector()) {
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
