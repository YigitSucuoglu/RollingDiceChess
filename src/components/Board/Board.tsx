import "./Board.css";
import gameManager from "../../engine/GameManager";
import Piece from "../Piece/Piece";
import { useEffect, useState } from "react";
import type { PieceType } from "../../types/Chess";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";

const RIGHT_LABELS: readonly [PieceType, string][] = [
  ["pawn", "Pawn"],
  ["knight", "Knight"],
  ["bishop", "Bishop"],
  ["rook", "Rook"],
  ["queen", "Queen"],
  ["king", "King"],
];

const PIECE_TYPES = RIGHT_LABELS.map(([pieceType]) => pieceType);
const PIECE_SYMBOLS: Readonly<Record<PieceType, string>> = {
  pawn: "♟",
  knight: "♞",
  bishop: "♝",
  rook: "♜",
  queen: "♛",
  king: "♚",
};

const ROLLING_DURATION_MS = 1000;
const SLOT_STOP_TIMES_MS = [700, 850, ROLLING_DURATION_MS] as const;
const SLOT_CHANGE_INTERVAL_MS = 75;

interface RollAnimationState {
  roll: readonly PieceType[];
  displayedRoll: readonly PieceType[];
  isRolling: boolean;
  stoppedSlots: number;
}

function Board() {
  const game = gameManager.getGame();

  const [, setRefresh] = useState(0);
  const [rollAnimation, setRollAnimation] = useState<RollAnimationState>({
    roll: game.currentRoll,
    displayedRoll: PIECE_TYPES.slice(0, 3),
    isRolling: true,
    stoppedSlots: 0,
  });

  if (rollAnimation.roll !== game.currentRoll) {
    setRollAnimation({
      roll: game.currentRoll,
      displayedRoll: PIECE_TYPES.slice(0, 3),
      isRolling: true,
      stoppedSlots: 0,
    });
  }

  const isRolling =
    rollAnimation.roll !== game.currentRoll || rollAnimation.isRolling;

  useEffect(() => {
    if (!rollAnimation.isRolling) {
      return;
    }

    const targetRoll = rollAnimation.roll;
    const startedAt = performance.now();
    let frame = 0;

    const intervalId = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      frame++;

      setRollAnimation((state) => ({
        ...state,
        displayedRoll: targetRoll.map((pieceType, index) => {
          const remainingTime = SLOT_STOP_TIMES_MS[index] - elapsed;

          if (remainingTime <= 0) {
            return pieceType;
          }

          const updateEveryFrames =
            remainingTime <= 225 ? 3 : remainingTime <= 400 ? 2 : 1;

          return frame % updateEveryFrames === 0
            ? PIECE_TYPES[(frame + index * 2) % PIECE_TYPES.length]
            : state.displayedRoll[index];
        }),
      }));
    }, SLOT_CHANGE_INTERVAL_MS);

    const stopTimeouts = SLOT_STOP_TIMES_MS.map((stopTime, slotIndex) =>
      window.setTimeout(() => {
        setRollAnimation((state) => {
          const displayedRoll = [...state.displayedRoll];
          displayedRoll[slotIndex] = targetRoll[slotIndex];

          return {
            ...state,
            displayedRoll,
            isRolling: slotIndex < targetRoll.length - 1,
            stoppedSlots: slotIndex + 1,
          };
        });
      }, stopTime)
    );

    return () => {
      window.clearInterval(intervalId);
      stopTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [rollAnimation.roll, rollAnimation.isRolling]);

  const squares = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board.squares[row][col];

      const isSelected =
        game.selectedSquare?.row === row &&
        game.selectedSquare?.col === col;

      const isPossibleMove = game.possibleMoves.some(
        (move) => move.to.row === row && move.to.col === col
      );

      const isLight = (row + col) % 2 === 0;

      squares.push(
        <div
          key={`${row}-${col}`}
          className={`square ${isLight ? "light" : "dark"} ${
            isSelected ? "selected" : ""
          }`}
          onClick={() => {
            if (isRolling) {
              return;
            }

            const move = game.possibleMoves.find(
              (m) => m.to.row === row && m.to.col === col
            );

            if (move) {

              game.makeMove(move);

              setRefresh((v) => v + 1);

              return;
            }

            game.selectSquare(row, col);

            setRefresh((v) => v + 1);
          }}
        >
          {piece && <Piece piece={piece} />}

          {isPossibleMove && <div className="move-dot" />}
        </div>
      );
    }
  }

  return (
    <div className="game-layout">
      <div className="turn-panel" aria-live="polite">
        {game.winner ? (
          <div className="winner-text">
            {game.winner === "white" ? "White" : "Black"} wins
          </div>
        ) : (
          <>
            <div className="turn-text">
              {game.currentTurn === "white" ? "White" : "Black"} turn
            </div>

            <div className="roll-section">
              <div className="panel-label">Current roll</div>

              <div className="slot-machine-frame">
                <img
                  alt=""
                  aria-hidden="true"
                  className="slot-machine-frame-image"
                  src={SLOT_MACHINE_ASSETS.generated.frame}
                />

                <div
                  className={`roll-slots ${isRolling ? "rolling" : ""}`}
                  aria-busy={isRolling}
                >
                  {rollAnimation.displayedRoll.map((pieceType, index) => (
                    <div
                      className={`roll-slot reel-window reel-window-${
                        index + 1
                      } ${
                        isRolling && index >= rollAnimation.stoppedSlots
                          ? "rolling-slot"
                          : "stopped-slot"
                      }`}
                      data-piece-type={pieceType}
                      key={index}
                    >
                      <img
                        alt={`${
                          RIGHT_LABELS.find(([type]) => type === pieceType)?.[1]
                        } chess piece`}
                        className="roll-piece-image"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                          event.currentTarget.nextElementSibling?.classList.add(
                            "is-visible"
                          );
                        }}
                        src={SLOT_MACHINE_ASSETS.symbols[pieceType]}
                      />
                      <span
                        aria-hidden="true"
                        className="roll-piece-fallback"
                      >
                        {PIECE_SYMBOLS[pieceType]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </>
        )}
      </div>

      <div className="board">{squares}</div>
    </div>
  );
}

export default Board;
