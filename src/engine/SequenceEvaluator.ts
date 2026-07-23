import type { PieceColor } from "../types/Chess";
import { TERMINAL_WIN_SCORE } from "./MoveEvaluator";
import { PIECE_VALUES } from "./PieceValues";
import type { TurnSequence } from "./TurnSequenceGenerator";
import MaterialExposureEvaluator from "./MaterialExposureEvaluator";
import PositionalEvaluator, {
  type PositionalScore,
} from "./PositionalEvaluator";

export interface SequenceScore {
  readonly terminalScore: number;
  readonly capturedMaterial: number;
  readonly captureScore: number;
  readonly finalMaterialScore: number;
  readonly maxExposedMaterial: number;
  readonly exposurePenalty: number;
  readonly positionalScore: PositionalScore;
  readonly totalScore: number;
}

const CAPTURE_SCORE_MULTIPLIER = 10;
const EXPOSURE_PENALTY_MULTIPLIER = 8;

export default class SequenceEvaluator {
  private readonly exposureEvaluator: MaterialExposureEvaluator;

  private readonly positionalEvaluator: PositionalEvaluator;

  constructor(
    exposureEvaluator: MaterialExposureEvaluator =
      new MaterialExposureEvaluator(),
    positionalEvaluator: PositionalEvaluator = new PositionalEvaluator()
  ) {
    this.exposureEvaluator = exposureEvaluator;
    this.positionalEvaluator = positionalEvaluator;
  }

  public evaluate(
    sequence: TurnSequence,
    botColor: PieceColor
  ): SequenceScore {
    const terminalScore =
      sequence.isTerminal && sequence.winner === botColor
        ? TERMINAL_WIN_SCORE
        : 0;
    const capturedMaterial = sequence.steps.reduce((total, step) => {
      const capturedType = step.capturedPieceType;

      return capturedType && capturedType !== "king"
        ? total + PIECE_VALUES[capturedType]
        : total;
    }, 0);
    const captureScore = capturedMaterial * CAPTURE_SCORE_MULTIPLIER;
    const finalMaterialScore = sequence.finalState.board.squares
      .flat()
      .reduce((total, piece) => {
        if (!piece || piece.type === "king") {
          return total;
        }

        const value = PIECE_VALUES[piece.type];

        return piece.color === botColor ? total + value : total - value;
      }, 0);
    const maxExposedMaterial = terminalScore
      ? 0
      : this.exposureEvaluator.getMaximumExposedMaterial(
          sequence.finalState,
          botColor
        );
    const exposurePenalty =
      maxExposedMaterial * EXPOSURE_PENALTY_MULTIPLIER;
    const positionalScore = terminalScore
      ? {
          centerScore: 0,
          developmentScore: 0,
          mobilityScore: 0,
          totalPositionalScore: 0,
        }
      : this.positionalEvaluator.evaluate(sequence.finalState, botColor);

    return {
      terminalScore,
      capturedMaterial,
      captureScore,
      finalMaterialScore,
      maxExposedMaterial,
      exposurePenalty,
      positionalScore,
      totalScore:
        terminalScore +
        captureScore +
        finalMaterialScore -
        exposurePenalty +
        positionalScore.totalPositionalScore,
    };
  }
}
