import type { Move, Piece, PieceColor } from "../types/Chess";
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
  return cloneSimulationState({
    board: game.board,
    rights: game.turnRights,
    currentTurn: game.currentTurn,
    lastMove: game.lastMove,
    winner: game.winner,
  });
}

export function cloneSimulationState(
  state: SimulationState
): SimulationState {
  return {
    board: state.board.clone(),
    rights: state.rights.clone(),
    currentTurn: state.currentTurn,
    lastMove: state.lastMove
      ? {
          ...state.lastMove,
          from: { ...state.lastMove.from },
          to: { ...state.lastMove.to },
        }
      : null,
    winner: state.winner,
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
  const capturedPiece = nextState.board.squares[move.to.row][move.to.col];

  if (movedPiece) {
    nextState.board.squares[move.to.row][move.to.col] = movedPiece;
    nextState.board.squares[move.from.row][move.from.col] = null;
    movedPiece.hasMoved = true;
  }

  const promotedState = handlePromotion(nextState, move);
  const enPassantState = handleEnPassant(promotedState, move, state.lastMove);
  const castledState = handleCastling(enPassantState, move);

  return handleWinner(castledState, move, capturedPiece);
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
  if (!move.isCastle) {
    return state;
  }

  const king = state.board.squares[move.to.row]?.[move.to.col];

  if (!king || king.id !== move.pieceId || king.type !== "king") {
    throw new Error(
      "Cannot apply castling: moving piece must be the matching king."
    );
  }

  if (
    move.from.row !== move.to.row ||
    move.from.col !== 4 ||
    (move.to.col !== 6 && move.to.col !== 2)
  ) {
    throw new Error("Cannot apply castling: invalid king move.");
  }

  const originalRow = king.color === "white" ? 7 : 0;

  if (move.from.row !== originalRow) {
    throw new Error("Cannot apply castling: king is not on its original row.");
  }

  const isKingside = move.to.col === 6;
  const rookFromCol = isKingside ? 7 : 0;
  const rookToCol = isKingside ? 5 : 3;
  const rook = state.board.squares[move.to.row][rookFromCol];

  if (!rook) {
    throw new Error("Cannot apply castling: rook is missing.");
  }

  if (rook.type !== "rook") {
    throw new Error("Cannot apply castling: castling piece is not a rook.");
  }

  if (rook.color !== king.color) {
    throw new Error("Cannot apply castling: rook has wrong color.");
  }

  if (state.board.squares[move.to.row][rookToCol]) {
    throw new Error("Cannot apply castling: rook target square is occupied.");
  }

  state.board.squares[move.to.row][rookToCol] = rook;
  state.board.squares[move.to.row][rookFromCol] = null;
  rook.hasMoved = true;

  return state;
}

function handleWinner(
  state: SimulationState,
  move: Move,
  capturedPiece: Piece | null
): SimulationState {
  if (
    move.isEnPassant ||
    move.isCastle ||
    capturedPiece?.type !== "king"
  ) {
    return state;
  }

  const movedPiece = state.board.squares[move.to.row]?.[move.to.col];

  if (!movedPiece || movedPiece.id !== move.pieceId) {
    throw new Error(
      "Cannot determine winner: moving piece does not match the move."
    );
  }

  state.winner = movedPiece.color;

  return state;
}
