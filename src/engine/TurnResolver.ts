import type { Move } from "../types/Chess";
import MoveGenerator from "./MoveGenerator";
import { applySimulatedMove, type SimulationState } from "./Simulation";

export interface TurnResolution {
  maxConsumableRights: number;
  selectableMoves: Move[];
}

export default class TurnResolver {
  public resolve(state: SimulationState): TurnResolution {
    void state;
    void this.enumerateCandidateMoves;
    void this.createChildState;
    throw new Error("TurnResolver has not been implemented yet.");
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
}
