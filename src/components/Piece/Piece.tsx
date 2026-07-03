import type { Piece as ChessPiece } from "../../types/Chess";
import "./Piece.css";

interface PieceProps {
  piece: ChessPiece;
}

function getPieceSymbol(type: string, color: string) {
  if (color === "white") {
    switch (type) {
      case "king":
        return "♔";
      case "queen":
        return "♕";
      case "rook":
        return "♖";
      case "bishop":
        return "♗";
      case "knight":
        return "♘";
      case "pawn":
        return "♙";
    }
  }

  switch (type) {
    case "king":
      return "♚";
    case "queen":
      return "♛";
    case "rook":
      return "♜";
    case "bishop":
      return "♝";
    case "knight":
      return "♞";
    case "pawn":
      return "♟";
  }
}

function Piece({ piece }: PieceProps) {
  return <span className="piece">{getPieceSymbol(piece.type, piece.color)}</span>;
}

export default Piece;