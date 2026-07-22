import type { ChessClockSnapshot } from "../../engine/ChessClock";
import type { PieceColor } from "../../types/Chess";
import { formatClockTime } from "./clockFormat";
import "./ChessClockPanel.css";

interface ChessClockPanelProps {
  color: PieceColor;
  isPlayer: boolean;
  snapshot: ChessClockSnapshot;
}

const LOW_TIME_THRESHOLD_MS = 15_000;

function getAccessibleTime(remainingMs: number): string {
  const safeRemainingMs = Math.max(0, remainingMs);
  const totalSeconds = Math.ceil(safeRemainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes} minutes ${seconds} seconds`;
}

function ChessClockPanel({
  color,
  isPlayer,
  snapshot,
}: ChessClockPanelProps) {
  const remainingMs =
    color === "white"
      ? snapshot.whiteRemainingMs
      : snapshot.blackRemainingMs;
  const isActive = snapshot.isRunning && snapshot.activeColor === color;
  const isLowTime = remainingMs <= LOW_TIME_THRESHOLD_MS;
  const colorLabel = color === "white" ? "WHITE" : "BLACK";
  const roleLabel = isPlayer ? "YOU" : "BOT";

  return (
    <div
      aria-label={`${colorLabel.toLowerCase()} player clock: ${getAccessibleTime(remainingMs)}`}
      className={`chess-clock${isActive ? " is-active" : ""}${
        isLowTime ? " is-low-time" : ""
      }`}
      role="timer"
    >
      <span className="chess-clock-player">
        {colorLabel} <span aria-hidden="true">·</span> {roleLabel}
      </span>
      <time className="chess-clock-time">{formatClockTime(remainingMs)}</time>
    </div>
  );
}

export default ChessClockPanel;
