import type { Piece as ChessPiece } from "../../types/Chess";
import type { PieceSet } from "../../types/PieceSet";
import { resolvePieceVisual } from "../../config/pieceSets";
import "./Piece.css";

interface PieceProps {
  piece: ChessPiece;
  pieceSet: PieceSet;
}

function Piece({ piece, pieceSet }: PieceProps) {
  const visual = resolvePieceVisual({
    context: "board",
    pieceColor: piece.color,
    pieceType: piece.type,
    pieceSet,
  });

  if (visual.kind === "image") {
    return (
      <img
        alt={`${piece.color === "white" ? "White" : "Black"} ${visual.label}`}
        className="piece piece-image"
        src={visual.src}
      />
    );
  }

  return <span className="piece">{visual.value}</span>;
}

export default Piece;
