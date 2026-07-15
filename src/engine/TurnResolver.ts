import type { Move } from "../types/Chess";
import MoveGenerator from "./MoveGenerator";
import type { SimulationState } from "./Simulation";

export interface TurnResolution {
  maxConsumableRights: number;
  selectableMoves: Move[];
}

export default class TurnResolver {
  public resolve(state: SimulationState): TurnResolution {
    void state;
    void this.enumerateCandidateMoves;
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
}
