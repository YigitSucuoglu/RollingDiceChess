const LOW_TIME_THRESHOLD_MS = 15_000;

export function formatClockTime(remainingMs: number): string {
  const safeRemainingMs = Math.max(0, remainingMs);

  if (safeRemainingMs <= LOW_TIME_THRESHOLD_MS) {
    const tenths =
      safeRemainingMs === 0
        ? 0
        : Math.max(0.1, Math.floor(safeRemainingMs / 100) / 10);

    return tenths.toFixed(1).padStart(4, "0");
  }

  const totalSeconds = Math.ceil(safeRemainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
