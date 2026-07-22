import type { PieceType } from "../types/Chess";

export type MaterialPieceType = Exclude<PieceType, "king">;

export const PIECE_VALUES: Readonly<Record<MaterialPieceType, number>> = {
  pawn: 100,
  knight: 300,
  bishop: 300,
  rook: 500,
  queen: 900,
};
