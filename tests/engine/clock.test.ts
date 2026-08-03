import { afterEach, describe, expect, it, vi } from "vitest";
import ChessClock from "../../src/engine/ChessClock";

describe("ChessClock", () => {
  afterEach(() => vi.useRealTimers());

  it("decrements only active player, switches with increment, and stops", () => {
    vi.useFakeTimers(); let now = 0; const timeout = vi.fn();
    const clock = new ChessClock(1, 2, timeout, () => now);
    clock.start("white"); now = 1_500;
    expect(clock.getRemainingTime("white")).toBe(58_500);
    expect(clock.getRemainingTime("black")).toBe(60_000);
    expect(clock.completeTurn("white")).toBe(true);
    expect(clock.getRemainingTime("white")).toBe(60_500);
    clock.start("black"); now = 2_000; clock.stop();
    expect(clock.getRemainingTime("black")).toBe(59_500);
    expect(timeout).not.toHaveBeenCalled();
  });

  it("fires timeout once and cannot restart after timeout or dispose", () => {
    vi.useFakeTimers(); let now = 0; const timeout = vi.fn();
    const clock = new ChessClock(0.001, 0, timeout, () => now);
    clock.start("white"); now = 100; clock.getSnapshot(); clock.getSnapshot();
    expect(timeout).toHaveBeenCalledOnce();
    expect(clock.start("black")).toBe(false);
    clock.dispose();
  });
});
