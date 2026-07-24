import { useEffect, useRef, useState } from "react";
import type { TurnHistory } from "../../engine/MoveHistory";
import soundManager from "../../services/SoundManager";
import "./MoveHistoryPanel.css";

interface MoveHistoryPanelProps {
  history: readonly TurnHistory[];
}

const MOVE_SLOTS = [0, 1, 2] as const;

function MoveHistoryPanel({ history }: MoveHistoryPanelProps) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(
    soundManager.isEnabled()
  );
  const moveCount = history.reduce(
    (total, turn) => total + turn.whiteMoves.length + turn.blackMoves.length,
    0
  );
  const latestTimestamp = history.reduce(
    (latest, turn) =>
      Math.max(
        latest,
        ...turn.whiteMoves.map((move) => move.timestamp),
        ...turn.blackMoves.map((move) => move.timestamp)
      ),
    0
  );

  useEffect(() => {
    const rows = rowsRef.current;

    if (rows) {
      rows.scrollTop = rows.scrollHeight;
    }
  }, [history.length, latestTimestamp]);

  useEffect(
    () => soundManager.subscribe(setIsSoundEnabled),
    []
  );

  return (
    <section
      aria-labelledby="move-history-title"
      className="move-history-panel"
    >
      <div className="move-history-header">
        <h2 id="move-history-title">Move History</h2>
        <button
          aria-label={isSoundEnabled ? "Mute sound" : "Enable sound"}
          aria-pressed={!isSoundEnabled}
          className="sound-toggle"
          onClick={() => soundManager.toggle()}
          title={isSoundEnabled ? "Mute sound" : "Enable sound"}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            {isSoundEnabled ? (
              <path d="M16 8.2a5 5 0 0 1 0 7.6M18.5 5.7a8.5 8.5 0 0 1 0 12.6" />
            ) : (
              <path d="m16.5 9 5 6m0-6-5 6" />
            )}
          </svg>
        </button>
      </div>

      <div className="move-history-columns" aria-hidden="true">
        <span />
        <span>White</span>
        <span>Black</span>
      </div>

      <div
        aria-label="Move history turns"
        className="move-history-rows"
        ref={rowsRef}
        role="table"
        tabIndex={0}
      >
        {moveCount === 0 ? (
          <div className="move-history-empty">No moves yet</div>
        ) : (
          history.map((turn) => (
            <div className="move-history-row" key={turn.turnNumber} role="row">
              <div className="move-history-number" role="rowheader">
                {turn.turnNumber}
                <span aria-hidden="true">|</span>
              </div>

              <div
                aria-label={`White moves in turn ${turn.turnNumber}`}
                className="move-history-moves"
                role="cell"
              >
                {MOVE_SLOTS.map((slot) => (
                  <span className="move-history-slot" key={slot}>
                    {turn.whiteMoves[slot]?.notation ?? ""}
                  </span>
                ))}
              </div>

              <div
                aria-label={`Black moves in turn ${turn.turnNumber}`}
                className="move-history-moves"
                role="cell"
              >
                {MOVE_SLOTS.map((slot) => (
                  <span className="move-history-slot" key={slot}>
                    {turn.blackMoves[slot]?.notation ?? ""}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default MoveHistoryPanel;
