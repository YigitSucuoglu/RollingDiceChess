import { useEffect, useState } from "react";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";
import type { PieceType } from "../../types/Chess";
import "./SlotReel.css";

const SYMBOL_CHANGE_INTERVAL_MS = 75;

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
  roll: readonly PieceType[];
  stopAfterMs: number;
}

interface ReelState {
  roll: readonly PieceType[];
  displayedType: PieceType;
  isSpinning: boolean;
}

function getStartingType(reelIndex: number): PieceType {
  return REEL_SYMBOLS[(reelIndex * 2) % REEL_SYMBOLS.length].type;
}

function SlotReel({ reelIndex, roll, stopAfterMs }: SlotReelProps) {
  const [reelState, setReelState] = useState<ReelState>({
    roll,
    displayedType: getStartingType(reelIndex),
    isSpinning: true,
  });

  if (reelState.roll !== roll) {
    setReelState({
      roll,
      displayedType: getStartingType(reelIndex),
      isSpinning: true,
    });
  }

  useEffect(() => {
    if (!reelState.isSpinning) {
      return;
    }

    const targetType = reelState.roll[reelIndex];
    const startedAt = performance.now();
    let frame = 0;

    const intervalId = window.setInterval(() => {
      const remainingTime = stopAfterMs - (performance.now() - startedAt);
      frame++;

      if (remainingTime <= 0) {
        setReelState((state) => ({
          ...state,
          displayedType: targetType,
        }));
        return;
      }

      const updateEveryFrames =
        remainingTime <= 225 ? 3 : remainingTime <= 400 ? 2 : 1;

      if (frame % updateEveryFrames === 0) {
        setReelState((state) => ({
          ...state,
          displayedType:
            REEL_SYMBOLS[(frame + reelIndex * 2) % REEL_SYMBOLS.length].type,
        }));
      }
    }, SYMBOL_CHANGE_INTERVAL_MS);

    const stopTimeoutId = window.setTimeout(() => {
      setReelState((state) => ({
        ...state,
        displayedType: targetType,
        isSpinning: false,
      }));
    }, stopAfterMs);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(stopTimeoutId);
    };
  }, [reelIndex, reelState.isSpinning, reelState.roll, stopAfterMs]);

  return (
    <div
      className={`slot-reel reel-window reel-window-${reelIndex + 1} ${
        reelState.isSpinning ? "rolling-slot" : "stopped-slot"
      }`}
      data-piece-type={reelState.displayedType}
    >
      <div className="reel-track">
        {REEL_SYMBOLS.map((symbol) => (
          <div
            className={`reel-symbol ${
              symbol.type === reelState.displayedType ? "is-active" : ""
            }`}
            key={symbol.type}
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
