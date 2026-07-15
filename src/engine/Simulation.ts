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

export function applySimulatedMove(
  state: SimulationState,
  move: Move
): SimulationState {
  const nextState: SimulationState = {
    board: state.board.clone(),
    rights: state.rights.clone(),
    currentTurn: state.currentTurn,
    lastMove: {
      ...move,
      from: { ...move.from },
      to: { ...move.to },
    },
    winner: state.winner,
  };

  const movedPiece = nextState.board.squares[move.from.row][move.from.col];

  if (movedPiece) {
    nextState.board.squares[move.to.row][move.to.col] = movedPiece;
    nextState.board.squares[move.from.row][move.from.col] = null;
    movedPiece.hasMoved = true;
  }

  const promotedState = handlePromotion(nextState, move);
  const enPassantState = handleEnPassant(promotedState, move);
  const castledState = handleCastling(enPassantState, move);

  return handleWinner(castledState, move);
}

function handlePromotion(state: SimulationState, move: Move): SimulationState {
  const movedPiece = state.board.squares[move.to.row][move.to.col];

  if (
    !movedPiece ||
    movedPiece.id !== move.pieceId ||
    movedPiece.type !== "pawn"
  ) {
    return state;
  }

  const promotionRow = movedPiece.color === "white" ? 0 : 7;

  if (move.to.row === promotionRow) {
    movedPiece.type = "queen";
  }

  return state;
}

function handleEnPassant(state: SimulationState, move: Move): SimulationState {
  void move;
  return state;
}

function handleCastling(state: SimulationState, move: Move): SimulationState {
  void move;
  return state;
}

function handleWinner(state: SimulationState, move: Move): SimulationState {
  void move;
  return state;
}
