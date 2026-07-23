import type { PieceColor } from "../types/Chess";
import { TERMINAL_WIN_SCORE } from "./MoveEvaluator";
import { PIECE_VALUES } from "./PieceValues";
import type { TurnSequence } from "./TurnSequenceGenerator";

export interface SequenceScore {
  readonly terminalScore: number;
  readonly capturedMaterial: number;
  readonly captureScore: number;
  readonly finalMaterialScore: number;
  readonly totalScore: number;
}

const CAPTURE_SCORE_MULTIPLIER = 10;

export default class SequenceEvaluator {
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

    return {
      terminalScore,
      capturedMaterial,
      captureScore,
      finalMaterialScore,
      totalScore: terminalScore + captureScore + finalMaterialScore,
    };
  }
}
