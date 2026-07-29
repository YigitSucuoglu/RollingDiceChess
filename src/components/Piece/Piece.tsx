import type { CSSProperties } from "react";
import type { Piece as ChessPiece } from "../../types/Chess";
import type { PieceSet } from "../../types/PieceSet";
import { resolvePieceVisual } from "../../config/pieceSets";
import "./Piece.css";

interface PieceProps {
  piece: ChessPiece;
  pieceSet: PieceSet;
}

type PieceStyle = CSSProperties & {
  "--piece-scale": number;
  "--piece-translate-x": string;
  "--piece-translate-y": string;
};

function Piece({ piece, pieceSet }: PieceProps) {
  const visual = resolvePieceVisual({
    context: "board",
    pieceColor: piece.color,
    pieceType: piece.type,
    pieceSet,
  });

  if (visual.kind === "image") {
    const pieceStyle: PieceStyle = {
      "--piece-scale": visual.scale,
      "--piece-translate-x": `${visual.translateX * 100}%`,
      "--piece-translate-y": `${visual.translateY * 100}%`,
    };

    return (
      <img
        alt={`${piece.color === "white" ? "White" : "Black"} ${visual.label}`}
        className="piece piece-image"
        src={visual.src}
        style={pieceStyle}
      />
    );
  }

  return <span className="piece">{visual.value}</span>;
}

export default Piece;
