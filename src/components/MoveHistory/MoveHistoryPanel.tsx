import { useEffect, useRef } from "react";
import type { TurnHistory } from "../../engine/MoveHistory";
import "./MoveHistoryPanel.css";

interface MoveHistoryPanelProps {
  history: readonly TurnHistory[];
}

const MOVE_SLOTS = [0, 1, 2] as const;
const AUTO_SCROLL_THRESHOLD_PX = 48;

function MoveHistoryPanel({ history }: MoveHistoryPanelProps) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
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

    if (rows && shouldAutoScrollRef.current) {
      rows.scrollTop = rows.scrollHeight;
    }
  }, [history.length, latestTimestamp]);

  const trackScrollPosition = () => {
    const rows = rowsRef.current;

    if (!rows) {
      return;
    }

    const distanceFromBottom =
      rows.scrollHeight - rows.scrollTop - rows.clientHeight;
    shouldAutoScrollRef.current =
      distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
  };

  return (
    <section
      aria-labelledby="move-history-title"
      className="move-history-panel"
    >
      <h2 id="move-history-title">Move History</h2>

      <div className="move-history-columns" aria-hidden="true">
        <span />
        <span>White</span>
        <span>Black</span>
      </div>

      <div
        aria-label="Move history turns"
        className="move-history-rows"
        onScroll={trackScrollPosition}
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
