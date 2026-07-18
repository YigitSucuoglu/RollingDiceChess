import type { CSSProperties } from "react";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";
import type { PieceType } from "../../types/Chess";
import "./SlotReel.css";

const REEL_REPEAT_COUNT = 3;

const REEL_SYMBOLS: readonly {
  type: PieceType;
  label: string;
  fallback: string;
  src: string;
}[] = [
  {
    type: "pawn",
    label: "Pawn",
    fallback: "♟",
    src: SLOT_MACHINE_ASSETS.symbols.pawn,
  },
  {
    type: "knight",
    label: "Knight",
    fallback: "♞",
    src: SLOT_MACHINE_ASSETS.symbols.knight,
  },
  {
    type: "bishop",
    label: "Bishop",
    fallback: "♝",
    src: SLOT_MACHINE_ASSETS.symbols.bishop,
  },
  {
    type: "rook",
    label: "Rook",
    fallback: "♜",
    src: SLOT_MACHINE_ASSETS.symbols.rook,
  },
  {
    type: "queen",
    label: "Queen",
    fallback: "♛",
    src: SLOT_MACHINE_ASSETS.symbols.queen,
  },
  {
    type: "king",
    label: "King",
    fallback: "♚",
    src: SLOT_MACHINE_ASSETS.symbols.king,
  },
];

interface SlotReelProps {
  reelIndex: number;
  targetPiece: PieceType;
  stopAfterMs: number;
}

type ReelStyle = CSSProperties & {
  "--reel-duration": string;
  "--reel-symbol-count": number;
  "--reel-target-offset": string;
  "--reel-track-height": string;
};

function SlotReel({ reelIndex, targetPiece, stopAfterMs }: SlotReelProps) {
  const trackSymbols = Array.from(
    { length: REEL_REPEAT_COUNT },
    () => REEL_SYMBOLS
  ).flat();
  const targetSymbolIndex = REEL_SYMBOLS.findIndex(
    (symbol) => symbol.type === targetPiece
  );
  const targetTrackIndex =
    (REEL_REPEAT_COUNT - 1) * REEL_SYMBOLS.length + targetSymbolIndex;
  const trackSymbolCount = trackSymbols.length;
  const reelStyle: ReelStyle = {
    "--reel-duration": `${stopAfterMs}ms`,
    "--reel-symbol-count": trackSymbolCount,
    "--reel-target-offset": `${
      -(targetTrackIndex / trackSymbolCount) * 100
    }%`,
    "--reel-track-height": `${trackSymbolCount * 100}%`,
  };

  return (
    <div
      aria-label={`${targetPiece} reel`}
      className={`slot-reel reel-window reel-window-${reelIndex + 1}`}
      role="img"
    >
      <div aria-hidden="true" className="reel-track" style={reelStyle}>
        {trackSymbols.map((symbol, trackIndex) => (
          <div
            className="reel-symbol"
            data-piece-type={symbol.type}
            key={`${trackIndex}-${symbol.type}`}
          >
            <img
              alt={`${symbol.label} chess piece`}
              className="roll-piece-image"
              onError={(event) => {
                event.currentTarget.hidden = true;
                event.currentTarget.nextElementSibling?.classList.add(
                  "is-visible"
                );
              }}
              src={symbol.src}
            />
            <span aria-hidden="true" className="roll-piece-fallback">
              {symbol.fallback}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SlotReel;
