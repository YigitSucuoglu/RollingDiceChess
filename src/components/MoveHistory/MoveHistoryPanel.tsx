import { useEffect, useRef } from "react";
import type { TurnHistory } from "../../engine/MoveHistory";
import "./MoveHistoryPanel.css";
import { useTranslation } from "react-i18next";

interface MoveHistoryPanelProps {
  history: readonly TurnHistory[];
}

const MOVE_SLOTS = [0, 1, 2] as const;

function MoveHistoryPanel({ history }: MoveHistoryPanelProps) {
  const { t } = useTranslation();
  const rowsRef = useRef<HTMLDivElement>(null);
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

  return (
    <section
      aria-labelledby="move-history-title"
      className="move-history-panel"
      id="move-history-panel"
    >
      <div className="move-history-header">
        <h2 id="move-history-title">{t("game.history")}</h2>
      </div>

      <div className="move-history-columns" aria-hidden="true">
        <span />
        <span>{t("common.colors.white")}</span>
        <span>{t("common.colors.black")}</span>
      </div>

      <div
        aria-label={t("game.historyAria")}
        className="move-history-rows"
        ref={rowsRef}
        role="table"
        tabIndex={0}
      >
        {moveCount === 0 ? (
          <div className="move-history-empty">{t("game.historyEmpty")}</div>
        ) : (
          history.map((turn) => (
            <div className="move-history-row" key={turn.turnNumber} role="row">
              <div className="move-history-number" role="rowheader">
                {turn.turnNumber}
                <span aria-hidden="true">|</span>
              </div>

              <div
                aria-label={t("game.movesInTurn", { color: t("common.colors.white"), turn: turn.turnNumber })}
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
                aria-label={t("game.movesInTurn", { color: t("common.colors.black"), turn: turn.turnNumber })}
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
