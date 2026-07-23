import type { PieceColor } from "../types/Chess";
import MoveGenerator from "./MoveGenerator";
import { PIECE_VALUES } from "./PieceValues";
import type { SimulationState } from "./Simulation";

export default class MaterialExposureEvaluator {
  public getMaximumExposedMaterial(
    state: SimulationState,
    exposedColor: PieceColor
  ): number {
    const attackingColor = exposedColor === "white" ? "black" : "white";
    let maximumExposedMaterial = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const attacker = state.board.squares[row][col];

        if (!attacker || attacker.color !== attackingColor) {
          continue;
        }

        const captureMoves = MoveGenerator.generateMoves(
          state.board,
          row,
          col,
          state.lastMove
        ).filter((move) => move.isCapture);

        for (const move of captureMoves) {
          const capturedPiece = move.isEnPassant
            ? state.board.squares[move.from.row]?.[move.to.col]
            : state.board.squares[move.to.row]?.[move.to.col];

          if (
            !capturedPiece ||
            capturedPiece.color !== exposedColor ||
            capturedPiece.type === "king"
          ) {
            continue;
          }

          maximumExposedMaterial = Math.max(
            maximumExposedMaterial,
            PIECE_VALUES[capturedPiece.type]
          );
        }
      }
    }

    return maximumExposedMaterial;
  }
}
