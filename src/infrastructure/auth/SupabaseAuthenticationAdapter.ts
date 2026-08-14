import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

import {
  AUTH_SESSION_SCHEMA_VERSION,
  cloneAuthenticationSession,
  toAccountId,
  toGuestSessionId,
  type AuthenticationFailureCode,
  type AuthenticationSession,
  type GuestSessionId,
} from "../../application/auth/AuthenticationContracts";
import type {
  AuthenticationPort,
  AuthenticationStateListener,
} from "../../application/auth/AuthenticationPort";

const GUEST_PREFERENCE_KEY = "roulettechess.auth-mode.v1";

interface PreferenceStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface SupabaseAuthClient {
  auth: Pick<SupabaseClient["auth"],
    "getSession" | "onAuthStateChange" | "signInAnonymously" | "signInWithOAuth" | "signOut">;
}

export interface SupabaseAuthenticationOptions {
  readonly guestSessionId?: GuestSessionId;
  readonly origin: string;
  readonly storage?: PreferenceStorage;
}

function defaultGuestSessionId(): GuestSessionId {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return toGuestSessionId(`guest-${suffix}`);
}

function readGuestPreference(storage: PreferenceStorage | undefined): boolean {
  try {
    return storage?.getItem(GUEST_PREFERENCE_KEY) === "guest";
  } catch {
    return false;
  }
}

function writeGuestPreference(
  storage: PreferenceStorage | undefined,
  enabled: boolean,
): void {
  try {
    if (enabled) storage?.setItem(GUEST_PREFERENCE_KEY, "guest");
    else storage?.removeItem(GUEST_PREFERENCE_KEY);
  } catch {
    // Guest mode remains available for this runtime when storage is denied.
  }
}

function toFailureCode(error: unknown): AuthenticationFailureCode {
  if (error instanceof Error && /cancel|closed|denied/i.test(error.message)) {
    return "cancelled";
  }
  return "temporarily-unavailable";
}

export class SupabaseAuthenticationAdapter implements AuthenticationPort {
  private readonly client: SupabaseAuthClient;

  private readonly listeners = new Set<AuthenticationStateListener>();

  private readonly guestSessionId: GuestSessionId;

  private readonly origin: string;

  private readonly storage?: PreferenceStorage;

  private unsubscribeFromSupabase?: () => void;

  private disposed = false;

  private session: AuthenticationSession;

  private lastPublishedSerialized = "";

  public constructor(
    client: SupabaseAuthClient,
    options: SupabaseAuthenticationOptions,
  ) {
    this.client = client;
    this.guestSessionId = options.guestSessionId ?? defaultGuestSessionId();
    this.origin = options.origin;
    this.storage = options.storage;
    this.session = this.createGuestCapableSession(
      readGuestPreference(this.storage) ? "guest" : "unselected",
    );
    const { data } = this.client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (this.disposed) return;
        this.applySupabaseSession(session);
      },
    );
    this.unsubscribeFromSupabase = () => data.subscription.unsubscribe();
  }

  public getSession(): AuthenticationSession {
    return cloneAuthenticationSession(this.session);
  }

  public isAuthenticationAvailable(): boolean {
    return true;
  }

  public async restoreSession(): Promise<AuthenticationSession> {
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.applySupabaseSession(data.session, false);
      if (!data.session && readGuestPreference(this.storage)) return this.chooseGuest();
    } catch {
      this.session = this.createGuestCapableSession(
        readGuestPreference(this.storage) ? "guest" : "unselected",
      );
      this.publish();
    }
    return this.getSession();
  }

  public subscribe(listener: AuthenticationStateListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    listener(this.getSession());
    return () => this.listeners.delete(listener);
  }

  public async chooseGuest(): Promise<AuthenticationSession> {
    writeGuestPreference(this.storage, true);
    if (this.session.state.status === "guest" && this.session.state.persistence === "cloud") {
      return this.getSession();
    }
    this.session = {
      schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
      state: { status: "authenticating", guestSessionId: this.guestSessionId },
    };
    this.publish();
    try {
      const { data, error } = await this.client.auth.signInAnonymously();
      if (error) throw error;
      this.applySupabaseSession(data.session, false);
    } catch {
      this.session = this.createGuestCapableSession("guest", "local");
    }
    this.publish();
    return this.getSession();
  }

  public async beginAuthentication(): Promise<AuthenticationSession> {
    if (this.session.state.status === "authenticating") return this.getSession();
    const fallback = this.guestSessionId;
    this.session = {
      schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
      state: { status: "authenticating", guestSessionId: fallback },
    };
    this.publish();
    try {
      const { error } = await this.client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: this.origin },
      });
      if (error) throw error;
    } catch (error: unknown) {
      this.session = {
        schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
        state: {
          status: "failed",
          failureCode: toFailureCode(error),
          guestSessionId: fallback,
        },
      };
      this.publish();
    }
    return this.getSession();
  }

  public async signOut(): Promise<AuthenticationSession> {
    try {
      writeGuestPreference(this.storage, true);
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      return this.chooseGuest();
    } catch {
      this.session = {
        schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
        state: {
          status: "failed",
          failureCode: "temporarily-unavailable",
          guestSessionId: this.guestSessionId,
        },
      };
      this.publish();
    }
    return this.getSession();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeFromSupabase?.();
    this.listeners.clear();
  }

  private applySupabaseSession(
    supabaseSession: Session | null,
    publish = true,
  ): void {
    if (supabaseSession?.user.id && supabaseSession.user.is_anonymous) {
      writeGuestPreference(this.storage, true);
      this.session = this.createGuestCapableSession("guest", "cloud");
    } else if (supabaseSession?.user.id) {
      writeGuestPreference(this.storage, false);
      this.session = {
        schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
        state: {
          status: "authenticated",
          account: {
            accountId: toAccountId(supabaseSession.user.id),
            provider: "google",
          },
        },
      };
    } else if (this.session.state.status !== "guest") {
      this.session = this.createGuestCapableSession(
        readGuestPreference(this.storage) ? "guest" : "unselected",
      );
    }
    if (publish) this.publish();
  }

  private createGuestCapableSession(
    status: "guest" | "unselected",
    persistence: "cloud" | "local" = "local",
  ): AuthenticationSession {
    return {
      schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
      state: status === "guest"
        ? { status, guestSessionId: this.guestSessionId, persistence }
        : { status, guestSessionId: this.guestSessionId },
    };
  }

  private publish(): void {
    const snapshot = this.getSession();
    const serialized = JSON.stringify(snapshot);
    if (serialized === this.lastPublishedSerialized) return;
    this.lastPublishedSerialized = serialized;
    for (const listener of this.listeners) listener(snapshot);
  }
}
