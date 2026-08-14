import { describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

import { toGuestSessionId } from "../../src/application/auth/AuthenticationContracts";
import { SupabaseAuthenticationAdapter, type SupabaseAuthClient } from "../../src/infrastructure/auth/SupabaseAuthenticationAdapter";
import { createDefaultPlayerProfile } from "../../src/profile/PlayerProfile";

function providerSession(userId: string): Session {
  return {
    access_token: "must-not-leak",
    expires_at: 4_000_000_000,
    expires_in: 3600,
    refresh_token: "must-not-leak",
    token_type: "bearer",
    user: {
      id: userId,
      app_metadata: { provider: "google" },
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00.000Z",
      user_metadata: { email: "private@example.com", avatar_url: "private" },
    },
  };
}

function anonymousSession(userId: string): Session {
  const session = providerSession(userId);
  return { ...session, user: { ...session.user, is_anonymous: true } };
}

function memoryStorage(initialGuest = false) {
  const values = new Map<string, string>();
  if (initialGuest) values.set("roulettechess.auth-mode.v1", "guest");
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function harness(restoredSession: Session | null = null) {
  let onChange: ((event: string, session: Session | null) => void) | undefined;
  const unsubscribe = vi.fn();
  const getSession = vi.fn(async () => ({ data: { session: restoredSession }, error: null }));
  const signInWithOAuth = vi.fn(async () => ({ data: { provider: "google", url: "https://provider.invalid" }, error: null }));
  const signInAnonymously = vi.fn(async () => ({ data: { user: anonymousSession("anonymous-uuid").user, session: anonymousSession("anonymous-uuid") }, error: null }));
  const signOut = vi.fn(async () => ({ error: null }));
  const client = {
    auth: {
      getSession,
      onAuthStateChange: vi.fn((callback) => {
        onChange = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
      signInAnonymously,
      signInWithOAuth,
      signOut,
    },
  } as unknown as SupabaseAuthClient;
  const adapter = new SupabaseAuthenticationAdapter(client, {
    guestSessionId: toGuestSessionId("guest-fixed"),
    origin: "https://roulettechess.example",
    storage: memoryStorage(),
  });
  return { adapter, getSession, onChange: (session: Session | null) => onChange?.("SIGNED_IN", session), signInAnonymously, signInWithOAuth, signOut, unsubscribe };
}

describe("SupabaseAuthenticationAdapter", () => {
  it("maps unauthenticated restoration to an explicit unselected state", async () => {
    const { adapter } = harness();
    expect(await adapter.restoreSession()).toEqual({
      schemaVersion: 1,
      state: { status: "unselected", guestSessionId: "guest-fixed" },
    });
    adapter.dispose();
  });

  it("maps only the provider user UUID and safe provider label", async () => {
    const { adapter } = harness(providerSession("account-uuid"));
    const restored = await adapter.restoreSession();
    expect(restored.state).toEqual({
      status: "authenticated",
      account: { accountId: "account-uuid", provider: "google" },
    });
    const serialized = JSON.stringify(restored);
    expect(serialized).not.toMatch(/access_token|refresh_token|private@example|avatar/i);
    adapter.dispose();
  });

  it("starts Google OAuth once with the current origin", async () => {
    const { adapter, signInWithOAuth } = harness();
    await adapter.beginAuthentication();
    expect(signInWithOAuth).toHaveBeenCalledOnce();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://roulettechess.example" },
    });
    adapter.dispose();
  });

  it("creates one cloud-backed anonymous Guest", async () => {
    const { adapter, signInAnonymously, signInWithOAuth } = harness();
    const listener = vi.fn();
    adapter.subscribe(listener);
    expect((await adapter.chooseGuest()).state).toEqual({
      status: "guest", guestSessionId: "guest-fixed", persistence: "cloud",
    });
    expect(signInAnonymously).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(signInWithOAuth).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("subscribes once, deduplicates equal provider events, and disposes", () => {
    const { adapter, onChange, unsubscribe } = harness();
    const listener = vi.fn();
    const stop = adapter.subscribe(listener);
    onChange(providerSession("account-1"));
    onChange(providerSession("account-1"));
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    adapter.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("signs out into guest mode and leaves local profile data untouched", async () => {
    const { adapter, onChange, signOut } = harness();
    const profile = createDefaultPlayerProfile(new Date("2026-01-01T00:00:00.000Z"));
    profile.totalXp = 725;
    const before = JSON.stringify(profile);
    onChange(providerSession("account-1"));
    expect((await adapter.signOut()).state.status).toBe("guest");
    expect(signOut).toHaveBeenCalledOnce();
    expect(JSON.stringify(profile)).toBe(before);
    adapter.dispose();
  });

  it("converts OAuth cancellation/failure into a safe guest-capable error", async () => {
    const { adapter, signInWithOAuth } = harness();
    signInWithOAuth.mockResolvedValueOnce({ data: { provider: null, url: null }, error: new Error("User cancelled") });
    const result = await adapter.beginAuthentication();
    expect(result.state).toEqual({
      status: "failed",
      failureCode: "cancelled",
      guestSessionId: "guest-fixed",
    });
    expect(JSON.stringify(result)).not.toContain("User cancelled");
    adapter.dispose();
  });

  it("keeps adapter instances isolated", async () => {
    const first = harness();
    const second = harness();
    await first.adapter.chooseGuest();
    expect(first.adapter.getSession().state.status).toBe("guest");
    expect(second.adapter.getSession().state.status).toBe("unselected");
    first.adapter.dispose();
    second.adapter.dispose();
  });
});
