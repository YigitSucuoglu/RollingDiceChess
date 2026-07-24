import type { Piece as ChessPiece } from "../../types/Chess";
import type { PieceTheme } from "../../types/PieceTheme";
import { resolvePieceVisual } from "../../config/pieceThemes";
import "./Piece.css";

interface PieceProps {
  piece: ChessPiece;
  theme: PieceTheme;
}

function Piece({ piece, theme }: PieceProps) {
  const visual = resolvePieceVisual({
    context: "board",
    pieceColor: piece.color,
    pieceType: piece.type,
    theme,
  });

  return <span className="piece">{visual.fallback}</span>;
}

export default Piece;
