import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  SupabaseAccountMigrationAdapter,
  type AccountMigrationProfileCoordinator,
} from "../../src/infrastructure/auth/SupabaseAccountMigrationAdapter";

const CONTINUATION_KEY = "roulettechess.account-migration.v1";

function storage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function continuation(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    handoffToken: "handoff-1",
    phase: "sign-in-existing",
    accountAuthUserId: "account-1",
    ...overrides,
  });
}

function profiles() {
  return {
    adoptCanonicalAfterAccountMigration: vi.fn(async () => undefined),
    hasProfileSyncConflict: vi.fn(() => false),
    prepareForAccountMigration: vi.fn(async () => true),
    resumeAfterAccountMigrationFailure: vi.fn(),
    suspendForAccountMigration: vi.fn(),
  } satisfies AccountMigrationProfileCoordinator;
}

function client(
  rpc: (name: string, parameters?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>,
  userId = "account-1",
): SupabaseClient {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: userId, is_anonymous: false } } },
        error: null,
      })),
    },
    rpc: vi.fn(rpc),
  } as unknown as SupabaseClient;
}

const unresolvedPayload = {
  status: "profile-conflict",
  guest: { displayName: "Guest6660", gamesPlayed: 2, multiplayerRating: 1000, totalXp: 136 },
  google: { displayName: "Yigit", gamesPlayed: 2, multiplayerRating: 1000, totalXp: 136 },
};

describe("account migration recovery", () => {
  it("adopts an already-resolved canonical Google survivor from stale local continuation", async () => {
    const local = storage({ [CONTINUATION_KEY]: continuation() });
    const coordinator = profiles();
    const adapter = new SupabaseAccountMigrationAdapter(client(async (name) => ({
      data: name === "inspect_profile_conflict"
        ? { status: "resolved", survivingPlayerId: "google-player" }
        : null,
      error: null,
    })), "http://localhost:5173", local, coordinator);

    expect(await adapter.restoreContinuation()).toBe(true);
    expect(coordinator.adoptCanonicalAfterAccountMigration).toHaveBeenCalledWith("google-player");
    expect(adapter.getState()).toEqual({ status: "completed" });
    expect(local.getItem(CONTINUATION_KEY)).toBeNull();
  });

  it("restores a genuine unresolved conflict instead of failing canonical profile bootstrap", async () => {
    const local = storage({ [CONTINUATION_KEY]: continuation() });
    const adapter = new SupabaseAccountMigrationAdapter(client(async () => ({
      data: unresolvedPayload,
      error: null,
    })), "http://localhost:5173", local, profiles());

    expect(await adapter.restoreContinuation()).toBe(true);
    expect(adapter.getState()).toMatchObject({
      status: "profile-conflict",
      guest: { displayName: "Guest6660", totalXp: 136 },
      google: { displayName: "Yigit", totalXp: 136 },
    });
  });

  for (const choice of ["USE_GOOGLE_PROFILE", "USE_GUEST_PROFILE"] as const) {
    it(`reconciles ${choice} when the resolve response is lost after server commit`, async () => {
      const local = storage({ [CONTINUATION_KEY]: continuation() });
      const coordinator = profiles();
      let resolved = false;
      const adapter = new SupabaseAccountMigrationAdapter(client(async (name) => {
        if (name === "resolve_profile_conflict") {
          resolved = true;
          return { data: null, error: { message: "network response lost" } };
        }
        return {
          data: resolved
            ? { status: "resolved", survivingPlayerId: choice === "USE_GOOGLE_PROFILE" ? "google-player" : "guest-player" }
            : unresolvedPayload,
          error: null,
        };
      }), "http://localhost:5173", local, coordinator);
      await adapter.restoreContinuation();

      await adapter.resolveConflict(choice);

      expect(adapter.getState()).toEqual({ status: "completed" });
      expect(coordinator.adoptCanonicalAfterAccountMigration).toHaveBeenCalledWith(
        choice === "USE_GOOGLE_PROFILE" ? "google-player" : "guest-player",
      );
    });
  }

  it("does not reuse a continuation bound to another authenticated user", async () => {
    const local = storage({ [CONTINUATION_KEY]: continuation() });
    const rpc = vi.fn(async () => ({ data: unresolvedPayload, error: null }));
    const coordinator = profiles();
    const adapter = new SupabaseAccountMigrationAdapter(
      client(rpc, "account-2"), "http://localhost:5173", local, coordinator,
    );

    expect(await adapter.restoreContinuation()).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(local.getItem(CONTINUATION_KEY)).toBeNull();
    expect(coordinator.resumeAfterAccountMigrationFailure).toHaveBeenCalledOnce();
  });

  it("clears only local recovery metadata on sign-out", () => {
    const local = storage({ [CONTINUATION_KEY]: continuation() });
    const coordinator = profiles();
    const adapter = new SupabaseAccountMigrationAdapter(
      client(async () => ({ data: null, error: null })),
      "http://localhost:5173",
      local,
      coordinator,
    );

    adapter.clearLocalRecovery();

    expect(local.getItem(CONTINUATION_KEY)).toBeNull();
    expect(coordinator.resumeAfterAccountMigrationFailure).toHaveBeenCalledOnce();
    expect(adapter.getState()).toEqual({ status: "idle" });
  });

  it("retries canonical adoption after a transient fetch failure", async () => {
    const local = storage({ [CONTINUATION_KEY]: continuation() });
    const coordinator = profiles();
    coordinator.adoptCanonicalAfterAccountMigration
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const adapter = new SupabaseAccountMigrationAdapter(client(async () => ({
      data: { status: "resolved", survivingPlayerId: "google-player" },
      error: null,
    })), "http://localhost:5173", local, coordinator);

    expect(await adapter.restoreContinuation()).toBe(false);
    expect(adapter.getState()).toEqual({ status: "failed", failureCode: "temporarily-unavailable" });
    expect(await adapter.restoreContinuation()).toBe(true);
    expect(adapter.getState()).toEqual({ status: "completed" });
    expect(coordinator.adoptCanonicalAfterAccountMigration).toHaveBeenCalledTimes(2);
  });

  it("keeps the conflict choice UI retryable when the server mutation did not occur", async () => {
    const local = storage({ [CONTINUATION_KEY]: continuation() });
    const adapter = new SupabaseAccountMigrationAdapter(client(async (name) => name === "resolve_profile_conflict"
      ? { data: null, error: { message: "temporary database failure" } }
      : { data: unresolvedPayload, error: null }), "http://localhost:5173", local, profiles());
    await adapter.restoreContinuation();

    await adapter.resolveConflict("USE_GOOGLE_PROFILE");

    expect(adapter.getState()).toMatchObject({
      status: "profile-conflict",
      failureCode: "resolution-failed",
      guest: { displayName: "Guest6660" },
      google: { displayName: "Yigit" },
    });
  });

  it("rejects a contradictory local retry after a choice has been recorded", async () => {
    const local = storage({
      [CONTINUATION_KEY]: continuation({ requestedResolution: "USE_GOOGLE_PROFILE" }),
    });
    const rpc = vi.fn(async () => ({ data: unresolvedPayload, error: null }));
    const adapter = new SupabaseAccountMigrationAdapter(
      client(rpc), "http://localhost:5173", local, profiles(),
    );
    await adapter.restoreContinuation();
    rpc.mockClear();

    await adapter.resolveConflict("USE_GUEST_PROFILE");

    expect(rpc).not.toHaveBeenCalled();
    expect(adapter.getState()).toMatchObject({
      status: "profile-conflict",
      failureCode: "resolution-failed",
    });
  });
});
