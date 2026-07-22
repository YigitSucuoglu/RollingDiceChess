import type { PieceColor } from "../types/Chess";

export interface ChessClockSnapshot {
  readonly whiteRemainingMs: number;
  readonly blackRemainingMs: number;
  readonly activeColor: PieceColor | null;
  readonly isRunning: boolean;
  readonly timedOutColor: PieceColor | null;
  readonly incrementMs: number;
}

type ClockNow = () => number;
type TimeoutHandler = (timedOutColor: PieceColor) => void;

export default class ChessClock {
  private readonly remainingMs: Record<PieceColor, number>;

  private readonly incrementMs: number;

  private readonly now: ClockNow;

  private readonly onTimeout: TimeoutHandler;

  private activeColor: PieceColor | null;

  private activeSinceMs: number | null;

  private timedOutColor: PieceColor | null;

  private timeoutId: ReturnType<typeof globalThis.setTimeout> | null;

  private isDisposed: boolean;

  constructor(
    initialMinutes: number,
    incrementSeconds: number,
    onTimeout: TimeoutHandler,
    now: ClockNow = Date.now
  ) {
    if (initialMinutes < 0 || incrementSeconds < 0) {
      throw new RangeError("Clock values cannot be negative.");
    }

    const initialTimeMs = initialMinutes * 60_000;

    this.remainingMs = {
      white: initialTimeMs,
      black: initialTimeMs,
    };
    this.incrementMs = incrementSeconds * 1000;
    this.now = now;
    this.onTimeout = onTimeout;
    this.activeColor = null;
    this.activeSinceMs = null;
    this.timedOutColor = null;
    this.timeoutId = null;
    this.isDisposed = false;
  }

  public start(color: PieceColor): boolean {
    if (this.isDisposed || this.timedOutColor) {
      return false;
    }

    if (this.activeColor === color) {
      return true;
    }

    if (this.activeColor !== null) {
      return false;
    }

    if (this.remainingMs[color] <= 0) {
      this.finishTimeout(color);
      return false;
    }

    this.activeColor = color;
    this.activeSinceMs = this.now();
    this.scheduleTimeout();

    return true;
  }

  public stop(): boolean {
    if (this.activeColor === null) {
      return false;
    }

    this.settleElapsedTime();

    if (this.timedOutColor) {
      return false;
    }

    this.clearScheduledTimeout();
    this.activeColor = null;
    this.activeSinceMs = null;

    return true;
  }

  public completeTurn(color: PieceColor): boolean {
    if (this.activeColor !== color || this.timedOutColor) {
      return false;
    }

    this.settleElapsedTime();

    if (this.timedOutColor) {
      return false;
    }

    this.clearScheduledTimeout();
    this.activeColor = null;
    this.activeSinceMs = null;
    this.remainingMs[color] += this.incrementMs;

    return true;
  }

  public getRemainingTime(color: PieceColor): number {
    this.settleElapsedTime();

    return this.remainingMs[color];
  }

  public getSnapshot(): ChessClockSnapshot {
    this.settleElapsedTime();

    return {
      whiteRemainingMs: this.remainingMs.white,
      blackRemainingMs: this.remainingMs.black,
      activeColor: this.activeColor,
      isRunning: this.activeColor !== null,
      timedOutColor: this.timedOutColor,
      incrementMs: this.incrementMs,
    };
  }

  public dispose(): void {
    this.clearScheduledTimeout();
    this.activeColor = null;
    this.activeSinceMs = null;
    this.isDisposed = true;
  }

  private settleElapsedTime(): void {
    if (
      this.isDisposed ||
      this.activeColor === null ||
      this.activeSinceMs === null
    ) {
      return;
    }

    const currentTime = this.now();
    const elapsedMs = Math.max(0, currentTime - this.activeSinceMs);
    const color = this.activeColor;

    this.remainingMs[color] = Math.max(
      0,
      this.remainingMs[color] - elapsedMs
    );
    this.activeSinceMs = currentTime;

    if (this.remainingMs[color] === 0) {
      this.finishTimeout(color);
    }
  }

  private scheduleTimeout(): void {
    if (this.activeColor === null) {
      return;
    }

    this.clearScheduledTimeout();
    this.timeoutId = globalThis.setTimeout(() => {
      this.timeoutId = null;
      this.settleElapsedTime();

      if (this.activeColor !== null && !this.timedOutColor) {
        this.scheduleTimeout();
      }
    }, this.remainingMs[this.activeColor]);
  }

  private finishTimeout(color: PieceColor): void {
    if (this.timedOutColor || this.isDisposed) {
      return;
    }

    this.clearScheduledTimeout();
    this.remainingMs[color] = 0;
    this.activeColor = null;
    this.activeSinceMs = null;
    this.timedOutColor = color;
    this.onTimeout(color);
  }

  private clearScheduledTimeout(): void {
    if (this.timeoutId !== null) {
      globalThis.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
