import { describe, expect, it } from "vitest";

import { resolveMatchExitPolicy } from "../../src/application/matches/MatchExitPolicy";
import LocalBotMatchSession from "../../src/application/matches/LocalBotMatchSession";
import { createDefaultGameSetup } from "../../src/config/gameSetup";
import type { Scheduler } from "../../src/domain/contracts/PlatformPorts";
import Game from "../../src/engine/Game";
import { toLocalBotMatchConfiguration } from "../../src/infrastructure/local/createLocalBotMatchSession";
import { createDefaultPlayerProfile, type PlayerProfile } from "../../src/profile/PlayerProfile";
import { PlayerProfileService } from "../../src/profile/PlayerProfileService";
import type { PlayerProfileRepository } from "../../src/profile/PlayerProfileRepository";

class FakeScheduler implements Scheduler {
  private nextId = 0;
  private readonly callbacks = new Map<number, () => void>();
  public setTimeout(callback: () => void): number {
    this.callbacks.set(++this.nextId, callback);
    return this.nextId;
  }
  public clearTimeout(handle: unknown): void { this.callbacks.delete(handle as number); }
  public runNext(): void {
    const next = this.callbacks.entries().next();
    if (next.done) return;
    const [id, callback] = next.value;
    this.callbacks.delete(id);
    callback();
  }
  public runAll(): void {
    while (this.callbacks.size > 0) {
      const [id, callback] = this.callbacks.entries().next().value as [number, () => void];
      this.callbacks.delete(id);
      callback();
    }
  }
  public get pendingCount(): number { return this.callbacks.size; }
}

class MemoryProfileRepository implements PlayerProfileRepository {
  private profile = createDefaultPlayerProfile(new Date("2026-01-01T00:00:00.000Z"));
  public getProfile(): PlayerProfile { return structuredClone(this.profile); }
  public saveProfile(profile: PlayerProfile): void { this.profile = structuredClone(profile); }
  public resetProfile(): PlayerProfile {
    this.profile = createDefaultPlayerProfile(new Date("2026-01-01T00:00:00.000Z"));
    return this.getProfile();
  }
}

function createSession() {
  const setup = createDefaultGameSetup();
  const scheduler = new FakeScheduler();
  let nextClockTimeoutId = 0;
  const clockScheduler: Scheduler = {
    setTimeout: () => ++nextClockTimeoutId,
    clearTimeout: () => undefined,
  };
  const repository = new MemoryProfileRepository();
  const profileService = new PlayerProfileService(repository);
  const profileSession = profileService.createGameSession(setup);
  const game = new Game(setup, undefined, profileSession.eventSink, {
    random: () => 0,
    scheduler: clockScheduler,
    timeSource: { now: () => 0 },
  });
  const session = new LocalBotMatchSession(
    game,
    toLocalBotMatchConfiguration(setup),
    profileSession.getXpProgressionResult,
    { scheduler, rollDurationMs: 1_000 },
  );
  return { game, profileSession, repository, scheduler, session };
}

describe("match exit lifecycle", () => {
  it("models current and future mode consequences without rating mutation", () => {
    expect(resolveMatchExitPolicy("singleplayer-bot")).toMatchObject({
      awardsXp: false, countsAsLoss: false, affectsRating: false, outcome: "abandoned",
    });
    expect(resolveMatchExitPolicy("multiplayer-unranked")).toMatchObject({
      awardsXp: false, countsAsLoss: false, affectsRating: false, outcome: "forfeit",
    });
    expect(resolveMatchExitPolicy("multiplayer-ranked")).toMatchObject({
      awardsXp: false, countsAsLoss: true, affectsRating: true, outcome: "forfeit",
    });
  });

  it("abandons once, disposes the session game and emits no completion reward or stats", async () => {
    const { game, profileSession, repository, scheduler, session } = createSession();
    const before = repository.getProfile();
    expect((await session.requestAction({
      schemaVersion: 1, type: "OPEN_EXIT_CONFIRMATION",
    })).accepted).toBe(true);
    const result = await session.requestAction({ schemaVersion: 1, type: "ABANDON_MATCH" });
    expect(result).toMatchObject({
      accepted: true,
      snapshot: { lifecycle: "abandoned", terminationReason: "abandoned", winner: null },
    });
    expect(game.isDisposed()).toBe(true);
    expect(profileSession.getXpProgressionResult()).toBeNull();
    expect(repository.getProfile()).toEqual(before);
    expect(scheduler.pendingCount).toBe(0);
    expect((await session.requestAction({
      schemaVersion: 1, type: "ABANDON_MATCH",
    })).accepted).toBe(false);
    session.dispose();
  });

  it("pauses and resumes the local clock around the safe confirmation", async () => {
    const { scheduler, session } = createSession();
    session.game.turnRights.set("pawn", 1);
    await session.requestAction({ schemaVersion: 1, type: "START_MANUAL_ROLL" });
    scheduler.runNext();
    expect(session.getSnapshot().clock.isRunning).toBe(true);
    await session.requestAction({ schemaVersion: 1, type: "OPEN_EXIT_CONFIRMATION" });
    expect(session.getSnapshot()).toMatchObject({
      exitConfirmationOpen: true,
      clock: { isRunning: false },
      capabilities: { canMove: false, canSelect: false },
    });
    await session.requestAction({ schemaVersion: 1, type: "CANCEL_EXIT_CONFIRMATION" });
    expect(session.getSnapshot().clock.isRunning).toBe(true);
    session.dispose();
  });

  it("cancels a resolving roll and all delayed callbacks on confirmed abandon", async () => {
    const { game, profileSession, scheduler, session } = createSession();
    await session.requestAction({ schemaVersion: 1, type: "START_MANUAL_ROLL" });
    expect(session.getSnapshot().roll.phase).toBe("spinning");
    await session.requestAction({ schemaVersion: 1, type: "OPEN_EXIT_CONFIRMATION" });
    await session.requestAction({ schemaVersion: 1, type: "ABANDON_MATCH" });
    scheduler.runAll();
    expect(game.isDisposed()).toBe(true);
    expect(game.winner).toBeNull();
    expect(profileSession.getXpProgressionResult()).toBeNull();
    session.dispose();
  });

  it("keeps an existing terminal result authoritative when leave races completion", async () => {
    const { game, session } = createSession();
    await session.requestAction({ schemaVersion: 1, type: "OPEN_EXIT_CONFIRMATION" });
    game.winner = "white";
    game.resultReason = "king-captured";
    const result = await session.requestAction({ schemaVersion: 1, type: "ABANDON_MATCH" });
    expect(result).toMatchObject({
      accepted: false,
      reason: "game-over",
      snapshot: { lifecycle: "completed", terminationReason: "king-captured", winner: "white" },
    });
    session.dispose();
  });
});
