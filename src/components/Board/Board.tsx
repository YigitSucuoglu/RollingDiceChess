import "./Board.css";
import gameManager from "../../engine/GameManager";
import Piece from "../Piece/Piece";
import { useEffect, useRef, useState } from "react";
import type { PieceType } from "../../types/Chess";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";
import SlotReel from "../SlotReel/SlotReel";

const ROLLING_DURATION_MS = 1000;
const SLOT_STOP_TIMES_MS = [700, 850, ROLLING_DURATION_MS] as const;

type RollPhase = "ready" | "spinning" | "resolved";

interface RollAnimationState {
  displayedRoll: readonly PieceType[];
  phase: RollPhase;
  roll: readonly PieceType[];
  spinId: number;
}

const INITIAL_REEL_DISPLAY: readonly PieceType[] = [
  "pawn",
  "knight",
  "bishop",
];

function Board() {
  const game = gameManager.getGame();

  const [, setRefresh] = useState(0);
  const spinStartedForRollRef = useRef<readonly PieceType[] | null>(null);
  const [rollAnimation, setRollAnimation] = useState<RollAnimationState>({
    displayedRoll: INITIAL_REEL_DISPLAY,
    phase: "ready",
    roll: game.currentRoll,
    spinId: 0,
  });

  if (rollAnimation.roll !== game.currentRoll) {
    setRollAnimation({
      displayedRoll: rollAnimation.displayedRoll,
      phase: "ready",
      roll: game.currentRoll,
      spinId: rollAnimation.spinId,
    });
  }

  const rollPhase =
    rollAnimation.roll === game.currentRoll ? rollAnimation.phase : "ready";
  const isInputLocked = rollPhase !== "resolved";

  useEffect(() => {
    if (rollAnimation.phase !== "spinning") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRollAnimation((state) => ({ ...state, phase: "resolved" }));
    }, ROLLING_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [rollAnimation.phase, rollAnimation.spinId]);

  const startRoll = () => {
    if (
      rollPhase !== "ready" ||
      spinStartedForRollRef.current === game.currentRoll
    ) {
      return;
    }

    spinStartedForRollRef.current = game.currentRoll;
    setRollAnimation((state) => ({
      ...state,
      displayedRoll: game.currentRoll,
      phase: "spinning",
      spinId: state.spinId + 1,
    }));
  };

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
            if (isInputLocked) {
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
                  className={`roll-slots ${
                    rollPhase === "spinning" ? "rolling" : ""
                  }`}
                  aria-busy={rollPhase === "spinning"}
                >
                  {rollAnimation.displayedRoll.map((pieceType, index) => (
                    <SlotReel
                      key={`${rollAnimation.spinId}-${index}`}
                      isSpinning={rollPhase === "spinning"}
                      reelIndex={index}
                      stopAfterMs={SLOT_STOP_TIMES_MS[index]}
                      targetPiece={pieceType}
                    />
                  ))}
                </div>
              </div>

              <button
                className="roll-button"
                disabled={rollPhase !== "ready"}
                onClick={startRoll}
                type="button"
              >
                ROLL
              </button>
            </div>

          </>
        )}
      </div>

      <div className="board">{squares}</div>
    </div>
  );
}

export default Board;
