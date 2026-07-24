import type { CSSProperties } from "react";
import { resolvePieceVisual } from "../../config/pieceThemes";
import type { PieceColor, PieceType } from "../../types/Chess";
import type { PieceTheme } from "../../types/PieceTheme";
import "./SlotReel.css";

const REEL_REPEAT_COUNT = 3;

const REEL_PIECE_TYPES: readonly PieceType[] = [
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
  "king",
];

interface SlotReelProps {
  isSpinning: boolean;
  pieceColor: PieceColor;
  pieceTheme: PieceTheme;
  reelIndex: number;
  targetPiece: PieceType;
  stopAfterMs: number;
}

type ReelStyle = CSSProperties & {
  "--reel-accent-delay": string;
  "--reel-duration": string;
  "--reel-landing-overshoot": string;
  "--reel-symbol-count": number;
  "--reel-target-offset": string;
  "--reel-track-height": string;
};

function SlotReel({
  isSpinning,
  pieceColor,
  pieceTheme,
  reelIndex,
  targetPiece,
  stopAfterMs,
}: SlotReelProps) {
  const reelSymbols = REEL_PIECE_TYPES.map((type) => ({
    type,
    visual: resolvePieceVisual({
      context: "slot",
      pieceColor,
      pieceType: type,
      theme: pieceTheme,
    }),
  }));
  const trackSymbols = Array.from(
    { length: REEL_REPEAT_COUNT },
    () => reelSymbols
  ).flat();
  const targetSymbolIndex = reelSymbols.findIndex(
    (symbol) => symbol.type === targetPiece
  );
  const targetTrackIndex =
    (REEL_REPEAT_COUNT - 1) * reelSymbols.length + targetSymbolIndex;
  const trackSymbolCount = trackSymbols.length;
  const reelStyle: ReelStyle = {
    "--reel-accent-delay": `${Math.max(0, stopAfterMs - 150)}ms`,
    "--reel-duration": `${stopAfterMs}ms`,
    "--reel-landing-overshoot": `${-8 / trackSymbolCount}%`,
    "--reel-symbol-count": trackSymbolCount,
    "--reel-target-offset": `${
      -(targetTrackIndex / trackSymbolCount) * 100
    }%`,
    "--reel-track-height": `${trackSymbolCount * 100}%`,
  };

  return (
    <div
      aria-label={
        isSpinning
          ? `Reel ${reelIndex + 1} spinning`
          : `Reel ${reelIndex + 1}: ${targetPiece}`
      }
      className={`slot-reel reel-window reel-window-${reelIndex + 1}`}
      role="img"
    >
      <div
        aria-hidden="true"
        className={`reel-track ${isSpinning ? "is-spinning" : ""}`}
        style={reelStyle}
      >
        {trackSymbols.map((symbol, trackIndex) => (
          <div
            className={`reel-symbol ${
              trackIndex === targetTrackIndex ? "is-target" : ""
            }`}
            data-piece-type={symbol.type}
            key={`${trackIndex}-${symbol.type}`}
          >
            <img
              alt={`${symbol.visual.label} chess piece`}
              className="roll-piece-image"
              onError={(event) => {
                event.currentTarget.hidden = true;
                event.currentTarget.nextElementSibling?.classList.add(
                  "is-visible"
                );
              }}
              src={symbol.visual.src ?? undefined}
            />
            <span aria-hidden="true" className="roll-piece-fallback">
              {symbol.visual.fallback}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SlotReel;
