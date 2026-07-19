import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { SLOT_MACHINE_ASSETS } from "../../assets/slot-machine";
import type { PieceColor } from "../../types/Chess";
import "./GameResultModal.css";

export type GameEndReason = "king-captured";

interface GameResultModalProps {
  endReason: GameEndReason;
  onMainMenu: () => void;
  onPlayAgain: () => void;
  winner: PieceColor;
}

const END_REASON_LABELS: Record<GameEndReason, string> = {
  "king-captured": "King captured",
};

function GameResultModal({
  endReason,
  onMainMenu,
  onPlayAgain,
  winner,
}: GameResultModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    playAgainRef.current?.focus();
  }, []);

  const keepFocusInDialog = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const actions = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)"
    );

    if (!actions || actions.length === 0) {
      return;
    }

    const firstAction = actions[0];
    const lastAction = actions[actions.length - 1];

    if (event.shiftKey && document.activeElement === firstAction) {
      event.preventDefault();
      lastAction.focus();
    } else if (!event.shiftKey && document.activeElement === lastAction) {
      event.preventDefault();
      firstAction.focus();
    }
  };

  return (
    <div className="game-result-overlay">
      <div
        aria-describedby="game-result-reason"
        aria-labelledby="game-result-title"
        aria-modal="true"
        className="game-result-dialog"
        onKeyDown={keepFocusInDialog}
        ref={dialogRef}
        role="dialog"
      >
        <div className="game-result-eyebrow">Game over</div>

        <img
          alt=""
          aria-hidden="true"
          className="game-result-king"
          src={SLOT_MACHINE_ASSETS.symbols.king}
        />

        <h2 id="game-result-title">
          {winner === "white" ? "White" : "Black"} wins
        </h2>

        <p id="game-result-reason">{END_REASON_LABELS[endReason]}</p>

        <div className="game-result-actions">
          <button
            className="game-result-button primary"
            onClick={onPlayAgain}
            ref={playAgainRef}
            type="button"
          >
            Play again
          </button>

          <button
            className="game-result-button secondary"
            onClick={onMainMenu}
            type="button"
          >
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}

export default GameResultModal;
