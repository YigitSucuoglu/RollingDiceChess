import { describe, expect, it, vi } from "vitest";

import { toAccountId, toGuestSessionId } from "../../src/application/auth/AuthenticationContracts";
import type { AccountProfileAssociation } from "../../src/application/accounts/ProfileOwnership";
import { createDefaultPlayerProfile } from "../../src/profile/PlayerProfile";
import { GuestAuthenticationAdapter } from "../../src/infrastructure/auth/GuestAuthenticationAdapter";

describe("GuestAuthenticationAdapter", () => {
  const createAdapter = (id: string) =>
    new GuestAuthenticationAdapter(() => toGuestSessionId(id));

  it("starts and restores one stable guest session", async () => {
    const adapter = createAdapter("guest-test");
    const initial = adapter.getSession();
    const restored = await adapter.restoreSession();

    expect(initial).toEqual({
      schemaVersion: 1,
      state: { status: "guest", guestSessionId: "guest-test", persistence: "local" },
    });
    expect(restored).toEqual(initial);
    expect(await adapter.beginAuthentication()).toEqual(initial);
    adapter.dispose();
  });

  it("publishes the current state and supports unsubscribe and disposal", () => {
    const adapter = createAdapter("guest-subscription");
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    adapter.dispose();
    adapter.subscribe(listener);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps independent adapters isolated", () => {
    const first = createAdapter("guest-first");
    const second = createAdapter("guest-second");

    expect(first.getSession().state).not.toEqual(second.getSession().state);
    first.dispose();
    expect(second.getSession().state).toEqual({
      status: "guest",
      guestSessionId: "guest-second",
      persistence: "local",
    });
    second.dispose();
  });

  it("exposes JSON-safe DTOs without credentials or provider payloads", () => {
    const adapter = createAdapter("guest-json");
    const serialized = JSON.stringify(adapter.getSession());

    expect(JSON.parse(serialized)).toEqual(adapter.getSession());
    expect(serialized).not.toMatch(/token|credential|password|provider|email/i);
    adapter.dispose();
  });

  it("keeps account identity separate from the local player profile", () => {
    const profile = createDefaultPlayerProfile(new Date("2026-01-01T00:00:00.000Z"));
    const association: AccountProfileAssociation = {
      accountId: toAccountId("account-1"),
      playerProfileId: profile.playerId,
    };

    expect(association.accountId).toBe("account-1");
    expect(association.playerProfileId).toBe(profile.playerId);
    expect(profile).not.toHaveProperty("accountId");
  });
});
