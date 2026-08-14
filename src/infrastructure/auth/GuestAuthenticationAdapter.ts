import {
  AUTH_SESSION_SCHEMA_VERSION,
  cloneAuthenticationSession,
  toGuestSessionId,
  type AuthenticationSession,
  type GuestSessionId,
} from "../../application/auth/AuthenticationContracts";
import type {
  AuthenticationPort,
  AuthenticationStateListener,
} from "../../application/auth/AuthenticationPort";

export type GuestSessionIdFactory = () => GuestSessionId;

function createGuestSessionId(): GuestSessionId {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return toGuestSessionId(`guest-${suffix}`);
}

export class GuestAuthenticationAdapter implements AuthenticationPort {
  private readonly listeners = new Set<AuthenticationStateListener>();

  private readonly session: AuthenticationSession;

  private disposed = false;

  public constructor(idFactory: GuestSessionIdFactory = createGuestSessionId) {
    this.session = {
      schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
      state: { status: "guest", guestSessionId: idFactory(), persistence: "local" },
    };
  }

  public isAuthenticationAvailable(): boolean {
    return false;
  }

  public getSession(): AuthenticationSession {
    return cloneAuthenticationSession(this.session);
  }

  public async restoreSession(): Promise<AuthenticationSession> {
    return this.getSession();
  }

  public subscribe(listener: AuthenticationStateListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    listener(this.getSession());
    return () => this.listeners.delete(listener);
  }

  public async chooseGuest(): Promise<AuthenticationSession> {
    return this.getSession();
  }

  public async beginAuthentication(): Promise<AuthenticationSession> {
    // AUTH-01A has no provider. Remaining a guest keeps offline play available.
    return this.getSession();
  }

  public async signOut(): Promise<AuthenticationSession> {
    // A guest has no credentials or remote session to revoke.
    return this.getSession();
  }

  public dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}
