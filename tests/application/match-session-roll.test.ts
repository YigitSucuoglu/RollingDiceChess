import { describe, expect, it, vi } from "vitest";
import LocalBotMatchSession from "../../src/application/matches/LocalBotMatchSession";
import { createDefaultGameSetup } from "../../src/config/gameSetup";
import type { Scheduler } from "../../src/domain/contracts/PlatformPorts";
import Game from "../../src/engine/Game";
import type { GameEventSink } from "../../src/engine/GameEvents";
import { toLocalBotMatchConfiguration } from "../../src/infrastructure/local/createLocalBotMatchSession";

class FakeScheduler implements Scheduler {
  private id = 0;
  private callbacks = new Map<number, () => void>();
  setTimeout(callback: () => void): number { this.callbacks.set(++this.id, callback); return this.id; }
  clearTimeout(handle: unknown): void { this.callbacks.delete(handle as number); }
  runNext(): void {
    const entry = this.callbacks.entries().next().value as [number, () => void] | undefined;
    if (entry) { this.callbacks.delete(entry[0]); entry[1](); }
  }
  get pendingCount(): number { return this.callbacks.size; }
}

function createRollSession() {
  const scheduler = new FakeScheduler();
  const random = vi.fn(() => 0);
  const eventSink: GameEventSink = {
    onRoll: vi.fn(), onMove: vi.fn(), onTurnCompleted: vi.fn(), onGameCompleted: vi.fn(),
  };
  const setup = createDefaultGameSetup();
  const game = new Game(setup, undefined, eventSink, {
    random, scheduler, timeSource: { now: () => 0 },
  });
  const session = new LocalBotMatchSession(
    game, toLocalBotMatchConfiguration(setup), undefined,
    { scheduler, rollDurationMs: 1_000 },
  );
  return { eventSink, game, random, scheduler, session };
}

const startRoll = (session: LocalBotMatchSession) => session.requestAction({
  schemaVersion: 1, type: "START_MANUAL_ROLL",
});

describe("session-owned manual roll lifecycle", () => {
  it("publishes ready, spinning and resolved while handing the clock off on resolve", async () => {
    const { eventSink, game, random, scheduler, session } = createRollSession();
    const phases = [session.getSnapshot().roll.phase];
    session.subscribe((snapshot) => phases.push(snapshot.roll.phase));
    const originalRoll = game.currentRoll;
    const result = await startRoll(session);
    expect(result).toMatchObject({ accepted: true, snapshot: { roll: { phase: "spinning", sequence: 1 } } });
    expect(result.snapshot.roll.visibleRoll).toEqual(originalRoll);
    expect(game.clock.getSnapshot().isRunning).toBe(false);
    expect(random).toHaveBeenCalledTimes(3);
    expect(eventSink.onRoll).toHaveBeenCalledTimes(1);
    expect(scheduler.pendingCount).toBe(1);
    expect(await startRoll(session)).toMatchObject({ accepted: false, reason: "roll-in-progress" });
    expect(scheduler.pendingCount).toBe(1);
    scheduler.runNext();
    expect(session.getSnapshot().roll.phase).toBe("resolved");
    expect(game.clock.getSnapshot()).toMatchObject({ isRunning: true, activeColor: "white" });
    expect(phases).toEqual(["ready", "spinning", "resolved"]);
    expect(random).toHaveBeenCalledTimes(3);
    expect(eventSink.onRoll).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it("returns typed rejections without duplicating lifecycle work", async () => {
    const { game, scheduler, session } = createRollSession();
    expect((await startRoll(session)).accepted).toBe(true);
    expect(await startRoll(session)).toMatchObject({ accepted: false, reason: "roll-in-progress" });
    scheduler.runNext();
    expect(await startRoll(session)).toMatchObject({ accepted: false, reason: "roll-not-allowed" });
    game.currentTurn = game.setup.botColor;
    game.currentRoll = [...game.currentRoll];
    expect(await startRoll(session)).toMatchObject({ accepted: false, reason: "not-human-turn" });
    game.currentTurn = game.setup.playerColor;
    game.winner = game.setup.playerColor;
    expect(await startRoll(session)).toMatchObject({ accepted: false, reason: "game-over" });
    session.dispose();
    expect(await startRoll(session)).toMatchObject({ accepted: false, reason: "session-disposed" });
  });

  it("cancels a pending resolution and isolates independently constructed sessions", async () => {
    const first = createRollSession();
    const second = createRollSession();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    first.session.subscribe(firstListener);
    second.session.subscribe(secondListener);
    await startRoll(first.session);
    first.session.dispose();
    expect(first.scheduler.pendingCount).toBe(0);
    first.scheduler.runNext();
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).not.toHaveBeenCalled();
    expect(first.game.clock.getSnapshot().isRunning).toBe(false);
    second.session.dispose();
  });

  it("resets to ready when a later human turn has a new currentRoll", async () => {
    const { game, scheduler, session } = createRollSession();
    await startRoll(session);
    scheduler.runNext();
    const firstRoll = game.currentRoll;
    const pieceTypes = ["pawn", "knight", "bishop", "rook", "queen", "king"] as const;
    for (const type of pieceTypes) game.turnRights.set(type, 0);
    expect(game.skipUnplayableTurn()).toBe(true);
    for (const type of pieceTypes) game.turnRights.set(type, 0);
    expect(game.skipUnplayableTurn()).toBe(true);
    const snapshot = session.getSnapshot();
    expect(game.currentRoll).not.toBe(firstRoll);
    expect(snapshot.currentPlayer).toBe(game.setup.playerColor);
    expect(snapshot.roll).toMatchObject({ phase: "ready", canStartManualRoll: true });
    session.dispose();
  });
});
