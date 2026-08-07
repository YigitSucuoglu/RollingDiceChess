import { describe, expect, it, vi } from "vitest";

import LocalBotMatchSession from "../../src/application/matches/LocalBotMatchSession";
import { createDefaultGameSetup } from "../../src/config/gameSetup";
import type { Scheduler } from "../../src/domain/contracts/PlatformPorts";
import Game from "../../src/engine/Game";
import { toLocalBotMatchConfiguration } from "../../src/infrastructure/local/createLocalBotMatchSession";

function createSession(scheduler?: Scheduler): LocalBotMatchSession {
  const setup = createDefaultGameSetup();
  const game = new Game(setup, undefined, undefined, {
    random: () => 0,
    scheduler,
    timeSource: { now: () => 0 },
  });
  return new LocalBotMatchSession(
    game,
    toLocalBotMatchConfiguration(setup),
    undefined,
    { scheduler: { setTimeout: () => 0, clearTimeout: () => undefined } },
  );
}

describe("LocalBotMatchSession", () => {
  it("exposes JSON-safe versioned configuration and isolated snapshot DTOs", () => {
    const session = createSession();
    const configuration = session.configuration;
    const snapshot = session.getSnapshot();

    expect(configuration).toMatchObject({ schemaVersion: 1, mode: "bot" });
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      mode: "bot",
      authority: "local",
      connection: "local",
      lifecycle: "active",
    });
    expect(() => JSON.stringify(configuration)).not.toThrow();
    expect(() => JSON.stringify(snapshot)).not.toThrow();
    snapshot.board[6][0]!.type = "queen";
    expect(session.game.board.squares[6][0]?.type).toBe("pawn");
    session.dispose();
  });

  it("delegates serializable actions and publishes state changes", async () => {
    const session = createSession();
    session.game.turnRights.set("pawn", 1);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    const selection = await session.requestAction({
      schemaVersion: 1,
      type: "SELECT_SQUARE",
      position: { row: 6, col: 0 },
    });
    expect(selection.accepted).toBe(true);
    const move = selection.snapshot.selectableMoves.find(
      (candidate) => candidate.from.row === 6 && candidate.from.col === 0,
    )!;
    const result = await session.requestAction({
      schemaVersion: 1,
      type: "MAKE_MOVE",
      pieceId: move.pieceId,
      from: move.from,
      to: move.to,
    });
    expect(result.accepted).toBe(true);
    expect(session.game.board.squares[move.to.row][move.to.col]?.type).toBe("pawn");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    session.dispose();
  });

  it("starts the authoritative local clock only through an explicit action and cancels it on dispose", async () => {
    const clearTimeout = vi.fn();
    const scheduler: Scheduler = {
      setTimeout: vi.fn(() => "clock-timeout"),
      clearTimeout,
    };
    const session = createSession(scheduler);
    session.game.turnRights.set("pawn", 1);
    expect(session.getSnapshot().clock.isRunning).toBe(false);
    const result = await session.requestAction({ schemaVersion: 1, type: "START_CLOCK" });
    expect(result.accepted).toBe(true);
    expect(result.snapshot.clock.activeColor).toBe("white");
    session.dispose();
    expect(clearTimeout).toHaveBeenCalledWith("clock-timeout");
  });

  it("keeps multiple local sessions independent and rejects actions after disposal", async () => {
    const first = createSession();
    const second = createSession();
    first.game.board.squares[6][0] = null;
    expect(second.game.board.squares[6][0]?.type).toBe("pawn");
    first.dispose();
    const result = await first.requestAction({ schemaVersion: 1, type: "START_CLOCK" });
    expect(result.accepted).toBe(false);
    second.dispose();
  });
});
