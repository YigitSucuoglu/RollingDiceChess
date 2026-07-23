import type { PieceColor } from "../types/Chess";
import { selectRandomItem } from "./BotMoveSelector";
import SequenceEvaluator from "./SequenceEvaluator";
import type { TurnSequence } from "./TurnSequenceGenerator";
import type { TurnSequenceSelector } from "./TurnSequenceSelector";

export default class HeuristicSequenceSelector
  implements TurnSequenceSelector
{
  private readonly evaluator: SequenceEvaluator;

  constructor(evaluator: SequenceEvaluator = new SequenceEvaluator()) {
    this.evaluator = evaluator;
  }

  public selectSequence(
    sequences: readonly TurnSequence[],
    botColor: PieceColor,
    random: () => number
  ): TurnSequence {
    let highestScore = Number.NEGATIVE_INFINITY;
    const bestSequences: TurnSequence[] = [];

    for (const sequence of sequences) {
      const score = this.evaluator.evaluate(sequence, botColor).totalScore;

      if (score > highestScore) {
        highestScore = score;
        bestSequences.length = 0;
        bestSequences.push(sequence);
      } else if (score === highestScore) {
        bestSequences.push(sequence);
      }
    }

    return selectRandomItem(bestSequences, random);
  }
}
