import type { Move, PieceType } from "../types/Chess";

const PIECE_SYMBOLS: Readonly<Record<Exclude<PieceType, "pawn">, string>> = {
  king: "K",
  queen: "Q",
  rook: "R",
  bishop: "B",
  knight: "N",
};

function toSquare(row: number, col: number): string {
  return `${String.fromCharCode(97 + col)}${8 - row}`;
}

export default class NotationGenerator {
  public generate(move: Move, piece: PieceType): string {
    if (move.isCastle) {
      return move.to.col === 6 ? "O-O" : "O-O-O";
    }

    const destination = toSquare(move.to.row, move.to.col);
    const captureMarker = move.isCapture ? "x" : "";
    const promotion = move.isPromotion ? "=Q" : "";
    const enPassant = move.isEnPassant ? " e.p." : "";

    if (piece === "pawn") {
      const originFile = String.fromCharCode(97 + move.from.col);
      const pawnPrefix = move.isCapture ? originFile : "";

      return `${pawnPrefix}${captureMarker}${destination}${promotion}${enPassant}`;
    }

    return `${PIECE_SYMBOLS[piece]}${captureMarker}${destination}${promotion}${enPassant}`;
  }
}
