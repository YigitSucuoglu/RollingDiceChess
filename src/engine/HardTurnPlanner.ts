import { createSimulationState } from "./Simulation";
import HeuristicSequenceSelector from "./HeuristicSequenceSelector";
import type { BotTurnPlan, BotTurnPlanner } from "./BotTurnPlanner";
import type Game from "./Game";
import TurnSequenceGenerator from "./TurnSequenceGenerator";

export default class HardTurnPlanner implements BotTurnPlanner {
  private readonly sequenceGenerator: TurnSequenceGenerator;

  private readonly sequenceSelector: HeuristicSequenceSelector;

  constructor(
    sequenceGenerator: TurnSequenceGenerator = new TurnSequenceGenerator(),
    sequenceSelector: HeuristicSequenceSelector =
      new HeuristicSequenceSelector()
  ) {
    this.sequenceGenerator = sequenceGenerator;
    this.sequenceSelector = sequenceSelector;
  }

  public planTurn(game: Game, random: () => number): BotTurnPlan | null {
    const generation = this.sequenceGenerator.generate(
      createSimulationState(game)
    );

    if (generation.sequences.length === 0) {
      return null;
    }

    const sequence = this.sequenceSelector.selectSequence(
      generation.sequences,
      game.currentTurn,
      random
    );

    return { moves: sequence.moves };
  }
}
