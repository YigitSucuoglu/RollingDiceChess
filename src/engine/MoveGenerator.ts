import type { Move, Piece } from "../types/Chess";
import ChessBoard from "./ChessBoard";

export default class MoveGenerator {
  public static generateMoves(
    board: ChessBoard,
    row: number,
    col: number
  ): Move[] {
    const piece = board.squares[row][col];

    if (!piece) return [];

    switch (piece.type) {
      case "pawn":
        return this.generatePawnMoves(board, piece, row, col);

      default:
        return [];
    }
  }

  private static generatePawnMoves(
    board: ChessBoard,
    piece: Piece,
    row: number,
    col: number
  ): Move[] {
    const moves: Move[] = [];

    const direction = piece.color === "white" ? -1 : 1;
    const nextRow = row + direction;

    // 1 kare ileri
    if (
      nextRow >= 0 &&
      nextRow < 8 &&
      board.squares[nextRow][col] === null
    ) {
      moves.push({
        from: { row, col },
        to: { row: nextRow, col },

        isCapture: false,
        isCastle: false,
        isPromotion: false,
        isEnPassant: false,
      });

      // İlk hamlede 2 kare
      const startRow = piece.color === "white" ? 6 : 1;
      const doubleRow = row + direction * 2;

      if (
        row === startRow &&
        board.squares[doubleRow][col] === null
      ) {
        moves.push({
          from: { row, col },
          to: { row: doubleRow, col },

          isCapture: false,
          isCastle: false,
          isPromotion: false,
          isEnPassant: false,
        });
      }
    }

    // Sol çapraz alma
    const leftCol = col - 1;

    if (
      nextRow >= 0 &&
      nextRow < 8 &&
      leftCol >= 0
    ) {
      const target = board.squares[nextRow][leftCol];

      if (target !== null && target.color !== piece.color) {
        moves.push({
          from: { row, col },
          to: { row: nextRow, col: leftCol },

          isCapture: true,
          isCastle: false,
          isPromotion: false,
          isEnPassant: false,
        });
      }
    }

    // Sağ çapraz alma
    const rightCol = col + 1;

    if (
      nextRow >= 0 &&
      nextRow < 8 &&
      rightCol < 8
    ) {
      const target = board.squares[nextRow][rightCol];

      if (target !== null && target.color !== piece.color) {
        moves.push({
          from: { row, col },
          to: { row: nextRow, col: rightCol },

          isCapture: true,
          isCastle: false,
          isPromotion: false,
          isEnPassant: false,
        });
      }
    }

    return moves;
  }
}