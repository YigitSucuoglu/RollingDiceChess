import type { CSSProperties } from "react";
import type { Piece as ChessPiece } from "../../types/Chess";
import type { PieceSet } from "../../types/PieceSet";
import { resolvePieceVisual } from "../../config/pieceSets";
import "./Piece.css";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        alt={`${t(`common.colors.${piece.color}`)} ${t(`common.pieces.${piece.type}`)}`}
        className="piece piece-image"
        src={visual.src}
        style={pieceStyle}
      />
    );
  }

  return <span className="piece">{visual.value}</span>;
}

export default Piece;
