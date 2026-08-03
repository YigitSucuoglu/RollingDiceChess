import ChessBoard from "../../src/engine/ChessBoard";
import TurnRights from "../../src/engine/TurnRights";
import type { SimulationState } from "../../src/engine/Simulation";
import type { Piece, PieceColor, PieceType } from "../../src/types/Chess";

let nextId = 0;

export function emptyBoard(): ChessBoard {
  const board = new ChessBoard();
  board.squares = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  return board;
}

export function piece(type: PieceType, color: PieceColor, row: number, col: number, hasMoved = false): Piece {
  return { id: `test-${++nextId}`, type, color, hasMoved, initialPosition: { row, col } };
}

export function put(board: ChessBoard, type: PieceType, color: PieceColor, row: number, col: number, hasMoved = false): Piece {
  const value = piece(type, color, row, col, hasMoved);
  board.squares[row][col] = value;
  return value;
}

export function state(board: ChessBoard, types: readonly PieceType[], currentTurn: PieceColor = "white"): SimulationState {
  const rights = new TurnRights();
  for (const type of types) rights.set(type, rights.get(type) + 1);
  return { board, rights, currentTurn, lastMove: null, winner: null };
}

export function destinations(moves: readonly { to: { row: number; col: number } }[]): string[] {
  return moves.map(({ to }) => `${to.row},${to.col}`).sort();
}
