import type { Move } from "../types/Chess";
import type { BotMoveSelector } from "./BotMoveSelector";
import { selectRandomItem } from "./BotMoveSelector";
import type ChessBoard from "./ChessBoard";
import MoveEvaluator from "./MoveEvaluator";

export default class HeuristicMoveSelector implements BotMoveSelector {
  private readonly evaluator: MoveEvaluator;

  constructor(evaluator: MoveEvaluator = new MoveEvaluator()) {
    this.evaluator = evaluator;
  }

  public selectMove(
    selectableMoves: readonly Move[],
    board: ChessBoard,
    random: () => number
  ): Move {
    let highestScore = Number.NEGATIVE_INFINITY;
    const bestMoves: Move[] = [];

    for (const move of selectableMoves) {
      const score = this.evaluator.evaluate(move, board).totalScore;

      if (score > highestScore) {
        highestScore = score;
        bestMoves.length = 0;
        bestMoves.push(move);
      } else if (score === highestScore) {
        bestMoves.push(move);
      }
    }

    return selectRandomItem(bestMoves, random);
  }
}
