import "./Board.css";
import gameManager from "../../engine/GameManager";
import Piece from "../Piece/Piece";
import { useEffect, useState } from "react";
import type { PieceType } from "../../types/Chess";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";
import SlotReel from "../SlotReel/SlotReel";

const ROLLING_DURATION_MS = 1000;
const SLOT_STOP_TIMES_MS = [700, 850, ROLLING_DURATION_MS] as const;

interface RollAnimationState {
  roll: readonly PieceType[];
  isRolling: boolean;
}

function Board() {
  const game = gameManager.getGame();

  const [, setRefresh] = useState(0);
  const [rollAnimation, setRollAnimation] = useState<RollAnimationState>({
    roll: game.currentRoll,
    isRolling: true,
  });

  if (rollAnimation.roll !== game.currentRoll) {
    setRollAnimation({
      roll: game.currentRoll,
      isRolling: true,
    });
  }

  const isRolling =
    rollAnimation.roll !== game.currentRoll || rollAnimation.isRolling;

  useEffect(() => {
    if (!rollAnimation.isRolling) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRollAnimation((state) => ({ ...state, isRolling: false }));
    }, ROLLING_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
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
                  {rollAnimation.roll.map((_, index) => (
                    <SlotReel
                      key={index}
                      reelIndex={index}
                      roll={rollAnimation.roll}
                      stopAfterMs={SLOT_STOP_TIMES_MS[index]}
                    />
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
