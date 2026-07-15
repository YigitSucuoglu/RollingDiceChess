import type { Move, PieceColor } from "../types/Chess";
import type ChessBoard from "./ChessBoard";
import type Game from "./Game";
import type TurnRights from "./TurnRights";

export interface SimulationState {
  board: ChessBoard;
  rights: TurnRights;
  currentTurn: PieceColor;
  lastMove: Move | null;
  winner: PieceColor | null;
}

export function createSimulationState(game: Game): SimulationState {
  return {
    board: game.board.clone(),
    rights: game.turnRights.clone(),
    currentTurn: game.currentTurn,
    lastMove: game.lastMove
      ? {
          ...game.lastMove,
          from: { ...game.lastMove.from },
          to: { ...game.lastMove.to },
        }
      : null,
    winner: game.winner,
  };
}
