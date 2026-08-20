import { describe, expect, it, vi } from "vitest";

import { E2EMultiplayerLobbyAdapter } from "../../src/infrastructure/testing/E2EMultiplayerLobbyAdapter";
import { MultiplayerLobbyError } from "../../src/application/multiplayer/MultiplayerLobbyPort";

describe("MULTIPLAYER-01B lobby application boundary", () => {
  it("lists only safe public lobby data", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    const [lobby] = await adapter.listOpenLobbies();
    expect(lobby).toMatchObject({
      host: { displayName: "Yigit", publicDiscriminator: "19F1P", multiplayerRating: 1248 },
      mode: "ranked", sidePreference: "random",
    });
    expect(JSON.stringify(lobby)).not.toMatch(/playerId|auth|privateCode|email/iu);
  });

  it("creates a ranked public lobby with Random side", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    const result = await adapter.createLobby({
      visibility: "public", mode: "ranked", sidePreference: "white",
      timeControl: { id: "blitz-5-1", initialMs: 300_000, incrementMs: 1_000 },
    });
    expect(result.role).toBe("host");
    expect(result.lobby).toMatchObject({ visibility: "public", mode: "ranked", sidePreference: "random", privateCode: null });
  });

  it("preserves a six-digit private code with a leading zero", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    const result = await adapter.createLobby({
      visibility: "private", mode: "unranked", sidePreference: "white",
      timeControl: { id: "rapid-10-0", initialMs: 600_000, incrementMs: 0 },
    });
    expect(result.lobby.privateCode).toBe("004921");
    expect((await adapter.listOpenLobbies())).toEqual([]);
  });

  it("joins public lobby as opponent and restores canonical context", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    const result = await adapter.joinPublicLobby("22222222-2222-4222-8222-222222222222");
    expect(result.role).toBe("opponent");
    expect(result.lobby.status).toBe("ready");
    expect(await adapter.getCurrentContext()).toEqual(result);
  });

  it("joins private lobby without numeric conversion", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    const result = await adapter.joinPrivateLobby("004921");
    expect(result.lobby.privateCode).toBe("004921");
  });

  it("maps unavailable private code to a safe application error", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    await expect(adapter.joinPrivateLobby("999999")).rejects.toMatchObject<Partial<MultiplayerLobbyError>>({ code: "lobby-unavailable" });
  });

  it("host kick returns the lobby to waiting without a penalty payload", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    await adapter.createLobby({ visibility: "public", mode: "unranked", sidePreference: "random", timeControl: { id: "blitz-3-0", initialMs: 180_000, incrementMs: 0 } });
    const current = await adapter.getCurrentContext();
    expect(current?.kind).toBe("lobby");
    if (current?.kind !== "lobby") throw new Error("fixture lobby missing");
    const kicked = await adapter.kickOpponent(current.lobby.lobbyId);
    expect(kicked.lobby.status).toBe("waiting");
    expect(kicked.lobby.opponent).toBeNull();
    expect(kicked).not.toHaveProperty("ratingDelta");
    expect(kicked).not.toHaveProperty("xp");
    expect(kicked).not.toHaveProperty("forfeit");
  });

  it("pre-start leave clears canonical membership", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    await adapter.joinPublicLobby("22222222-2222-4222-8222-222222222222");
    await adapter.leaveLobby("22222222-2222-4222-8222-222222222222");
    expect(await adapter.getCurrentContext()).toBeNull();
  });

  it("returns one safe future-game transition result", async () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    const result = await adapter.startMatch("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual({ matchId: "33333333-3333-4333-8333-333333333333", status: "active", ownSide: "white", revision: 1 });
  });

  it("cleans subscriptions", () => {
    const adapter = new E2EMultiplayerLobbyAdapter();
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);
    unsubscribe(); adapter.dispose();
    expect(listener).not.toHaveBeenCalled();
  });
});
