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
  const enPassantState = handleEnPassant(promotedState, move, state.lastMove);
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

function handleEnPassant(
  state: SimulationState,
  move: Move,
  previousLastMove: Move | null
): SimulationState {
  if (!move.isEnPassant) {
    return state;
  }

  const movedPiece = state.board.squares[move.to.row]?.[move.to.col];

  if (
    !movedPiece ||
    movedPiece.id !== move.pieceId ||
    movedPiece.type !== "pawn"
  ) {
    throw new Error(
      "Cannot apply en passant: moving piece must be the matching pawn."
    );
  }

  const capturedRow = movedPiece.color === "white"
    ? move.to.row + 1
    : move.to.row - 1;
  const capturedPiece = state.board.squares[capturedRow]?.[move.to.col];

  if (!capturedPiece) {
    throw new Error("Cannot apply en passant: captured square is empty.");
  }

  if (capturedPiece.type !== "pawn") {
    throw new Error("Cannot apply en passant: captured piece is not a pawn.");
  }

  if (capturedPiece.color === movedPiece.color) {
    throw new Error("Cannot apply en passant: captured pawn has wrong color.");
  }

  if (!previousLastMove || previousLastMove.pieceId !== capturedPiece.id) {
    throw new Error("Cannot apply en passant: lastMove does not match.");
  }

  state.board.squares[capturedRow][move.to.col] = null;

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
