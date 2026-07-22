import type { Move, Piece } from "../types/Chess";
import type ChessBoard from "./ChessBoard";
import { PIECE_VALUES, type MaterialPieceType } from "./PieceValues";

export interface MoveScore {
  readonly terminalScore: number;
  readonly captureScore: number;
  readonly totalScore: number;
}

export const TERMINAL_WIN_SCORE = 1_000_000;

export default class MoveEvaluator {
  public evaluate(move: Move, board: ChessBoard): MoveScore {
    const capturedPiece = this.getCapturedPiece(move, board);
    const terminalScore =
      capturedPiece?.type === "king" ? TERMINAL_WIN_SCORE : 0;
    const captureScore =
      capturedPiece && capturedPiece.type !== "king"
        ? PIECE_VALUES[capturedPiece.type as MaterialPieceType]
        : 0;

    return {
      terminalScore,
      captureScore,
      totalScore: terminalScore + captureScore,
    };
  }

  private getCapturedPiece(move: Move, board: ChessBoard): Piece | null {
    if (!move.isCapture) {
      return null;
    }

    if (move.isEnPassant) {
      return board.squares[move.from.row]?.[move.to.col] ?? null;
    }

    return board.squares[move.to.row]?.[move.to.col] ?? null;
  }
}
