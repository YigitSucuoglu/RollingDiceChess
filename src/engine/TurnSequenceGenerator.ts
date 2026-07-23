import type { Move, PieceColor, PieceType } from "../types/Chess";
import {
  cloneSimulationState,
  type SimulationState,
} from "./Simulation";
import TurnResolver from "./TurnResolver";

export interface TurnSequenceStep {
  readonly move: Move;
  readonly consumedRight: PieceType;
}

export interface TurnSequence {
  readonly steps: readonly TurnSequenceStep[];
  readonly moves: readonly Move[];
  readonly moveCount: number;
  readonly isTerminal: boolean;
  readonly winner: PieceColor | null;
  readonly finalState: SimulationState;
}

export interface TurnSequenceGenerationResult {
  readonly maxConsumableRights: number;
  readonly sequences: readonly TurnSequence[];
}

export default class TurnSequenceGenerator {
  private readonly turnResolver: TurnResolver;

  constructor(turnResolver: TurnResolver = new TurnResolver()) {
    this.turnResolver = turnResolver;
  }

  public generate(state: SimulationState): TurnSequenceGenerationResult {
    const initialState = cloneSimulationState(state);

    if (initialState.winner) {
      return { maxConsumableRights: 0, sequences: [] };
    }

    const initialResolution = this.turnResolver.resolve(initialState);
    const sequences: TurnSequence[] = [];
    const sequenceKeys = new Set<string>();

    this.collectSequences(
      initialState,
      [],
      initialResolution.maxConsumableRights,
      sequences,
      sequenceKeys
    );

    return {
      maxConsumableRights: initialResolution.maxConsumableRights,
      sequences,
    };
  }

  private collectSequences(
    state: SimulationState,
    steps: readonly TurnSequenceStep[],
    targetMoveCount: number,
    sequences: TurnSequence[],
    sequenceKeys: Set<string>
  ): void {
    if (state.winner) {
      this.addSequence(state, steps, sequences, sequenceKeys);
      return;
    }

    const resolution = this.turnResolver.resolve(state);

    if (resolution.selectableMoves.length === 0) {
      if (steps.length === targetMoveCount && steps.length > 0) {
        this.addSequence(state, steps, sequences, sequenceKeys);
      }

      return;
    }

    for (const move of resolution.selectableMoves) {
      const movingPiece = state.board.squares[move.from.row]?.[move.from.col];

      if (!movingPiece) {
        throw new Error("Cannot generate sequence: source square is empty.");
      }

      const childState = this.turnResolver.createContinuationState(state, move);
      const nextSteps = [
        ...steps,
        {
          move: this.cloneMove(move),
          consumedRight: movingPiece.type,
        },
      ];

      this.collectSequences(
        childState,
        nextSteps,
        targetMoveCount,
        sequences,
        sequenceKeys
      );
    }
  }

  private addSequence(
    finalState: SimulationState,
    steps: readonly TurnSequenceStep[],
    sequences: TurnSequence[],
    sequenceKeys: Set<string>
  ): void {
    const sequenceKey = this.createSequenceKey(steps);

    if (sequenceKeys.has(sequenceKey)) {
      return;
    }

    sequenceKeys.add(sequenceKey);
    const storedSteps = steps.map((step) => ({
      move: this.cloneMove(step.move),
      consumedRight: step.consumedRight,
    }));

    sequences.push({
      steps: storedSteps,
      moves: storedSteps.map((step) => step.move),
      moveCount: storedSteps.length,
      isTerminal: finalState.winner !== null,
      winner: finalState.winner,
      finalState: cloneSimulationState(finalState),
    });
  }

  private createSequenceKey(steps: readonly TurnSequenceStep[]): string {
    return JSON.stringify(
      steps.map(({ move }) => [
        move.pieceId,
        move.from.row,
        move.from.col,
        move.to.row,
        move.to.col,
        move.isCapture,
        move.isCastle,
        move.isPromotion,
        move.isEnPassant,
      ])
    );
  }

  private cloneMove(move: Move): Move {
    return {
      ...move,
      from: { ...move.from },
      to: { ...move.to },
    };
  }
}
