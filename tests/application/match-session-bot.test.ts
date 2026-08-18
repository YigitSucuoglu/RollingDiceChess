import { describe, expect, it, vi } from "vitest";
import LocalBotMatchSession from "../../src/application/matches/LocalBotMatchSession";
import { createDefaultGameSetup } from "../../src/config/gameSetup";
import type { Scheduler } from "../../src/domain/contracts/PlatformPorts";
import type { Bot } from "../../src/engine/BotController";
import Game from "../../src/engine/Game";
import { toLocalBotMatchConfiguration } from "../../src/infrastructure/local/createLocalBotMatchSession";
import type { Piece } from "../../src/types/Chess";

class FakeScheduler implements Scheduler {
  private id = 0;
  private callbacks = new Map<number, () => void>();
  public readonly delays: number[] = [];
  setTimeout(callback: () => void, delayMs: number): number {
    this.delays.push(delayMs);
    this.callbacks.set(++this.id, callback);
    return this.id;
  }
  clearTimeout(handle: unknown): void { this.callbacks.delete(handle as number); }
  runNext(): void {
    const entry = this.callbacks.entries().next().value as [number, () => void] | undefined;
    if (entry) { this.callbacks.delete(entry[0]); entry[1](); }
  }
  get pendingCount(): number { return this.callbacks.size; }
}

function createBotSession(bot?: Bot) {
  const scheduler = new FakeScheduler();
  const setup = { ...createDefaultGameSetup(), playerColor: "black" as const, botColor: "white" as const };
  const game = new Game(setup, bot, undefined, {
    random: () => 0, scheduler, timeSource: { now: () => 0 },
  });
  const session = new LocalBotMatchSession(
    game, toLocalBotMatchConfiguration(setup), undefined,
    { scheduler, botStartDelayMs: 500, rollDurationMs: 1_000 },
  );
  return { game, scheduler, session };
}

function createCompletingBot() {
  return {
    color: "white" as const,
    playTurn: vi.fn(async (game: Game, onMove?: () => void, signal?: AbortSignal) => {
      while (game.isBotTurn() && !signal?.aborted) {
        const move = game.getSelectableMoves()[0];
        if (!move) return;
        game.makeMove(move);
        onMove?.();
      }
    }),
  } satisfies Bot;
}

describe("session-owned bot lifecycle", () => {
  it("schedules once, reveals through the shared roll lifecycle, and completes the turn", async () => {
    const bot = createCompletingBot();
    const { game, scheduler, session } = createBotSession(bot);
    const phases: string[] = [];
    const players: string[] = [];
    session.subscribe((snapshot) => {
      phases.push(snapshot.roll.phase);
      players.push(snapshot.currentPlayer);
    });
    session.getSnapshot();
    session.getSnapshot();
    expect(scheduler.pendingCount).toBe(1);
    expect(scheduler.delays[0]).toBe(500);
    expect(bot.playTurn).not.toHaveBeenCalled();
    scheduler.runNext();
    expect(session.getSnapshot().roll).toMatchObject({ phase: "spinning", trigger: "automatic" });
    expect(scheduler.delays[1]).toBe(1_000);
    expect(bot.playTurn).not.toHaveBeenCalled();
    scheduler.runNext();
    await Promise.resolve();
    expect(bot.playTurn).toHaveBeenCalledOnce();
    expect(game.currentTurn).toBe("black");
    expect(session.getSnapshot().roll.phase).toBe("ready");
    expect(phases.filter((phase) => phase === "spinning")).toHaveLength(1);
    expect(players.at(-1)).toBe("black");
    expect(game.moveHistory.getSnapshot()[0].whiteMoves).toHaveLength(3);
    session.dispose();
  });

  it("cancels before pacing or during reveal without stale execution", () => {
    const beforePacingBot = createCompletingBot();
    const beforePacing = createBotSession(beforePacingBot);
    beforePacing.session.dispose();
    expect(beforePacing.scheduler.pendingCount).toBe(0);
    beforePacing.scheduler.runNext();
    expect(beforePacingBot.playTurn).not.toHaveBeenCalled();

    const duringRollBot = createCompletingBot();
    const duringRoll = createBotSession(duringRollBot);
    duringRoll.scheduler.runNext();
    duringRoll.session.dispose();
    expect(duringRoll.scheduler.pendingCount).toBe(0);
    duringRoll.scheduler.runNext();
    expect(duringRollBot.playTurn).not.toHaveBeenCalled();
  });

  it("prevents a stale planner completion from mutating a disposed match", async () => {
    let release: (() => void) | undefined;
    const planning = new Promise<void>((resolve) => { release = resolve; });
    const bot: Bot = {
      color: "white",
      playTurn: vi.fn(async (game) => {
        const plannedMove = game.getSelectableMoves()[0];
        await planning;
        if (plannedMove) game.makeMove(plannedMove);
      }),
    };
    const { game, scheduler, session } = createBotSession(bot);
    scheduler.runNext();
    scheduler.runNext();
    expect(bot.playTurn).toHaveBeenCalledOnce();
    const before = game.board.squares.map((row) => row.map((piece) => piece?.id ?? null));
    session.dispose();
    release?.();
    await Promise.resolve();
    expect(game.board.squares.map((row) => row.map((piece) => piece?.id ?? null))).toEqual(before);
  });

  it("aborts an in-flight bot planner when the match is confirmed abandoned", async () => {
    let release: (() => void) | undefined;
    const planning = new Promise<void>((resolve) => { release = resolve; });
    const bot: Bot = {
      color: "white",
      playTurn: vi.fn(async (game) => {
        const plannedMove = game.getSelectableMoves()[0];
        await planning;
        if (plannedMove) game.makeMove(plannedMove);
      }),
    };
    const { game, scheduler, session } = createBotSession(bot);
    scheduler.runNext();
    scheduler.runNext();
    expect(bot.playTurn).toHaveBeenCalledOnce();
    const before = game.board.squares.map((row) => row.map((piece) => piece?.id ?? null));

    await session.requestAction({ schemaVersion: 1, type: "OPEN_EXIT_CONFIRMATION" });
    const result = await session.requestAction({ schemaVersion: 1, type: "ABANDON_MATCH" });
    release?.();
    await Promise.resolve();

    expect(result).toMatchObject({ accepted: true, snapshot: { lifecycle: "abandoned" } });
    expect(game.board.squares.map((row) => row.map((piece) => piece?.id ?? null))).toEqual(before);
    expect(scheduler.pendingCount).toBe(0);
    session.dispose();
  });

  it("owns no-move review, message and automatic transition without invoking the planner", async () => {
    const bot = createCompletingBot();
    const { game, scheduler, session } = createBotSession(bot);
    game.board.squares = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
    scheduler.runNext();
    scheduler.runNext();
    expect(bot.playTurn).not.toHaveBeenCalled();
    expect(session.getSnapshot().skip.phase).toBe("reviewing");
    scheduler.runNext();
    expect(session.getSnapshot().skip.phase).toBe("message");
    scheduler.runNext();
    expect(game.currentTurn).toBe("black");
    expect(session.getSnapshot().skip.phase).toBe("none");
    session.dispose();
  });

  it("cancels a pending skip transition on dispose and cannot advance twice", () => {
    const { game, scheduler, session } = createBotSession(createCompletingBot());
    game.board.squares = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
    scheduler.runNext();
    scheduler.runNext();
    expect(session.getSnapshot().skip.phase).toBe("reviewing");
    const turnBeforeDispose = game.currentTurn;
    session.dispose();
    expect(scheduler.pendingCount).toBe(0);
    scheduler.runNext();
    scheduler.runNext();
    expect(game.currentTurn).toBe(turnBeforeDispose);
  });
});
