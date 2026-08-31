import { describe, expect, it, vi } from "vitest";

import OnlineMatchSession from "../../src/application/matches/OnlineMatchSession";
import {
  applyAuthoritativeMove,
  createAuthoritativeInitialState,
} from "../../src/application/multiplayer/AuthoritativeMatchEngine";
import type {
  MultiplayerMatchIntent,
  MultiplayerMatchPort,
  MultiplayerServerSnapshot,
} from "../../src/application/multiplayer/MultiplayerMatchPort";

const MATCH_ID = "33333333-3333-4333-8333-333333333333";

function snapshot(revision = 1): MultiplayerServerSnapshot {
  const now = new Date(0).toISOString();
  return {
    schemaVersion: 1,
    matchId: MATCH_ID,
    revision,
    status: "active",
    mode: "unranked",
    ownSide: "white",
    white: { displayName: "White", publicDiscriminator: "AAAAA", multiplayerRating: 1000 },
    black: { displayName: "Black", publicDiscriminator: "BBBBB", multiplayerRating: 1000 },
    timeControl: { id: "blitz-5-0", initialMs: 300_000, incrementMs: 0 },
    game: createAuthoritativeInitialState(() => 0),
    clock: {
      whiteRemainingMs: 300_000,
      blackRemainingMs: 300_000,
      activeTurnStartedAt: now,
      serverNow: now,
    },
    connections: { whiteReconnectDeadline: null, blackReconnectDeadline: null },
    winner: null,
    terminationReason: null,
    ratingSettlement: null,
  };
}

function createPort(initial: MultiplayerServerSnapshot) {
  let realtime: (() => void) | null = null;
  const requests: MultiplayerMatchIntent[] = [];
  const responders: Array<(value: MultiplayerServerSnapshot) => void> = [];
  const port: MultiplayerMatchPort = {
    request: vi.fn((intent: MultiplayerMatchIntent) => {
      requests.push(intent);
      return new Promise<MultiplayerServerSnapshot>((resolve) => responders.push(resolve));
    }),
    subscribe: vi.fn((_matchId, listener) => { realtime = listener; return () => undefined; }),
  };
  return { initial, port, requests, responders, notify: () => realtime?.() };
}

function createSession(fixture: ReturnType<typeof createPort>) {
  return new OnlineMatchSession(fixture.initial, fixture.port, {
    pieceSet: "gold",
    boardTheme: "default",
  }, {
    scheduler: { setTimeout, clearTimeout },
    timeSource: { now: () => Date.now() },
    isNetworkOnline: () => true,
  });
}

describe("OnlineMatchSession synchronization", () => {
  it("applies the successful authoritative move response directly and unlocks the next right", async () => {
    vi.useFakeTimers();
    const initial = snapshot();
    const fixture = createPort(initial);
    const session = createSession(fixture);
    await vi.advanceTimersByTimeAsync(1_000);
    await session.requestAction({ schemaVersion: 1, type: "SELECT_SQUARE", position: { row: 6, col: 0 } });
    const move = session.getSnapshot().selectableMoves[0]!;
    const pending = session.requestAction({ schemaVersion: 1, type: "MAKE_MOVE", pieceId: move.pieceId, from: move.from, to: move.to });
    expect(session.getSnapshot().capabilities.canMove).toBe(false);

    const transition = applyAuthoritativeMove(initial.game!, move.from, move.to, () => 0);
    fixture.responders.shift()?.({ ...initial, revision: 2, game: transition.state });
    const result = await pending;

    expect(result.accepted).toBe(true);
    expect(session.getSnapshot().board[move.to.row][move.to.col]?.id).toBe(move.pieceId);
    expect(session.getSnapshot().remainingRights.pawn).toBe(2);
    expect(session.getSnapshot().capabilities.canMove).toBe(true);
    expect(fixture.requests).toHaveLength(1);
    session.dispose();
    vi.useRealTimers();
  });

  it("starts Realtime reconciliation immediately and coalesces an event burst", async () => {
    vi.useFakeTimers();
    const fixture = createPort(snapshot());
    const session = createSession(fixture);

    fixture.notify();
    fixture.notify();
    fixture.notify();
    expect(fixture.requests.map((request) => request.action)).toEqual(["heartbeat"]);
    fixture.responders.shift()?.(snapshot(2));
    await Promise.resolve();
    expect(fixture.requests.map((request) => request.action)).toEqual(["heartbeat", "heartbeat"]);
    fixture.responders.shift()?.(snapshot(2));
    await Promise.resolve();
    expect(fixture.requests).toHaveLength(2);
    session.dispose();
    vi.useRealTimers();
  });

  it("does not drop a Realtime invalidation that arrives during a move request", async () => {
    vi.useFakeTimers();
    const initial = snapshot();
    const fixture = createPort(initial);
    const session = createSession(fixture);
    await vi.advanceTimersByTimeAsync(1_000);
    await session.requestAction({ schemaVersion: 1, type: "SELECT_SQUARE", position: { row: 6, col: 0 } });
    const move = session.getSnapshot().selectableMoves[0]!;
    const pending = session.requestAction({ schemaVersion: 1, type: "MAKE_MOVE", pieceId: move.pieceId, from: move.from, to: move.to });
    fixture.notify();
    const transition = applyAuthoritativeMove(initial.game!, move.from, move.to, () => 0);
    fixture.responders.shift()?.({ ...initial, revision: 2, game: transition.state });
    await pending;
    expect(fixture.requests.map((request) => request.action)).toEqual(["move", "heartbeat"]);
    fixture.responders.shift()?.({ ...initial, revision: 2, game: transition.state });
    session.dispose();
    vi.useRealTimers();
  });
});
