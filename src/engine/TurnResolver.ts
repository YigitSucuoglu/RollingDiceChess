import type { Move } from "../types/Chess";
import MoveGenerator from "./MoveGenerator";
import { applySimulatedMove, type SimulationState } from "./Simulation";

export interface TurnResolution {
  maxConsumableRights: number;
  selectableMoves: Move[];
}

export default class TurnResolver {
  public resolve(state: SimulationState): TurnResolution {
    const maxConsumableRights = this.calculateMaximumConsumable(state);
    const candidateMoves = this.enumerateCandidateMoves(state);
    const selectableMoves = candidateMoves.filter((move) => {
      const childState = this.createChildState(state, move);
      const score = 1 + this.calculateMaximumConsumable(childState);

      return score === maxConsumableRights;
    });

    return {
      maxConsumableRights,
      selectableMoves,
    };
  }

  private enumerateCandidateMoves(state: SimulationState): Move[] {
    const rights = state.rights.getSnapshot();
    const moves: Move[] = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board.squares[row][col];

        if (
          !piece ||
          piece.color !== state.currentTurn ||
          rights[piece.type] <= 0
        ) {
          continue;
        }

        moves.push(
          ...MoveGenerator.generateMoves(
            state.board,
            row,
            col,
            state.lastMove
          )
        );
      }
    }

    return moves;
  }

  private createChildState(
    state: SimulationState,
    move: Move
  ): SimulationState {
    const movingPiece = state.board.squares[move.from.row]?.[move.from.col];

    if (!movingPiece) {
      throw new Error("Cannot create child state: source square is empty.");
    }

    if (movingPiece.id !== move.pieceId) {
      throw new Error("Cannot create child state: pieceId does not match.");
    }

    if (!state.rights.has(movingPiece.type)) {
      throw new Error("Cannot create child state: matching right is missing.");
    }

    const childState = applySimulatedMove(state, move);

    childState.rights.consume(movingPiece.type);

    return childState;
  }

  private calculateMaximumConsumable(state: SimulationState): number {
    const candidateMoves = this.enumerateCandidateMoves(state);

    if (candidateMoves.length === 0) {
      return 0;
    }

    const parentRightCount = Object.values(
      state.rights.getSnapshot()
    ).reduce((total, count) => total + count, 0);
    let maximumConsumable = 0;

    for (const move of candidateMoves) {
      const childState = this.createChildState(state, move);
      const childRightCount = Object.values(
        childState.rights.getSnapshot()
      ).reduce((total, count) => total + count, 0);

      if (childRightCount !== parentRightCount - 1) {
        throw new Error(
          "Cannot calculate maximum consumable rights: child state must consume exactly one right."
        );
      }

      const score = 1 + this.calculateMaximumConsumable(childState);

      maximumConsumable = Math.max(maximumConsumable, score);
    }

    return maximumConsumable;
  }
}
