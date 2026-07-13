export type PieceColor = "white" | "black";

export type PieceType =
  | "king"
  | "queen"
  | "rook"
  | "bishop"
  | "knight"
  | "pawn";

export interface Piece {
  id: string;
  type: PieceType;
  color: PieceColor;
  hasMoved: boolean;
}

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;

  isCapture: boolean;
  isCastle: boolean;
  isPromotion: boolean;
  isEnPassant: boolean;
  
  pieceId: string;
}