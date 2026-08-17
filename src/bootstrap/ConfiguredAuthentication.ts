import {
  AUTH_SESSION_SCHEMA_VERSION,
  cloneAuthenticationSession,
  toGuestSessionId,
  type AuthenticationSession,
  type GuestSessionId,
} from "../application/auth/AuthenticationContracts";
import type {
  AuthenticationPort,
  AuthenticationStateListener,
} from "../application/auth/AuthenticationPort";
import playerProfileService from "../profile/PlayerProfileService";
import accountMigrationService from "../application/accounts/AccountMigrationService";

interface ConfiguredAuthenticationOptions {
  readonly origin: string;
  readonly publishableKey: string;
  readonly storage?: Storage;
  readonly url: string;
}

function createGuestSessionId(): GuestSessionId {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return toGuestSessionId(`guest-${suffix}`);
}

export default class ConfiguredAuthentication implements AuthenticationPort {
  private readonly listeners = new Set<AuthenticationStateListener>();
  private readonly guestSessionId = createGuestSessionId();
  private readonly options: ConfiguredAuthenticationOptions;
  private delegate?: AuthenticationPort;
  private delegatePromise?: Promise<AuthenticationPort>;
  private delegateUnsubscribe?: () => void;
  private onlineListenerAttached = false;
  private disposed = false;
  private lastPublishedSerialized = "";
  private session: AuthenticationSession = {
    schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
    state: { status: "unselected", guestSessionId: this.guestSessionId },
  };

  public constructor(options: ConfiguredAuthenticationOptions) {
    this.options = options;
  }

  public isAuthenticationAvailable(): boolean { return true; }
  public getSession(): AuthenticationSession { return cloneAuthenticationSession(this.session); }

  public async restoreSession(): Promise<AuthenticationSession> {
    const delegate = await this.getDelegate();
    this.session = await delegate.restoreSession();
    const migrationHandled = await accountMigrationService.restoreContinuation();
    if (!migrationHandled) await playerProfileService.handleAuthenticationSession(this.session);
    this.publish();
    return this.getSession();
  }

  public subscribe(listener: AuthenticationStateListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    const snapshot = this.getSession();
    this.lastPublishedSerialized = JSON.stringify(snapshot);
    listener(snapshot);
    return () => this.listeners.delete(listener);
  }

  public async chooseGuest(): Promise<AuthenticationSession> {
    this.session = await (await this.getDelegate()).chooseGuest();
    await playerProfileService.handleAuthenticationSession(this.session);
    this.publish();
    return this.getSession();
  }

  public async beginAuthentication(): Promise<AuthenticationSession> {
    return (await this.getDelegate()).beginAuthentication();
  }

  public async signOut(): Promise<AuthenticationSession> {
    return (await this.getDelegate()).signOut();
  }

  public dispose(): void {
    this.disposed = true;
    this.delegateUnsubscribe?.();
    if (this.onlineListenerAttached) window.removeEventListener("online", this.handleOnline);
    this.delegate?.dispose();
    accountMigrationService.dispose();
    this.listeners.clear();
  }

  private getDelegate(): Promise<AuthenticationPort> {
    if (this.delegatePromise) return this.delegatePromise;
    this.delegatePromise = Promise.all([
      import("../infrastructure/auth/SupabaseAuthenticationAdapter"),
      import("../infrastructure/auth/createSupabaseAuthClient"),
      import("../infrastructure/player/SupabaseCloudPlayerSync"),
      import("../infrastructure/auth/SupabaseAccountMigrationAdapter"),
    ]).then(([adapterModule, clientModule, playerModule, migrationModule]) => {
      const client = clientModule.createSupabaseAuthClient(this.options.url, this.options.publishableKey);
      playerProfileService.configureCloudSync(
        new playerModule.SupabaseCloudPlayerSync(client),
        this.options.storage,
      );
      accountMigrationService.configure(
        new migrationModule.SupabaseAccountMigrationAdapter(client, this.options.origin),
      );
      const delegate = new adapterModule.SupabaseAuthenticationAdapter(
        client,
        { guestSessionId: this.guestSessionId, origin: this.options.origin, storage: this.options.storage },
      );
      this.delegate = delegate;
      this.delegateUnsubscribe = delegate.subscribe((session) => {
        this.session = session;
        if (accountMigrationService.getState().status === "idle") {
          void playerProfileService.handleAuthenticationSession(session);
        }
        this.publish();
      });
      if (!this.onlineListenerAttached) {
        window.addEventListener("online", this.handleOnline);
        this.onlineListenerAttached = true;
      }
      return delegate;
    });
    return this.delegatePromise;
  }

  private readonly handleOnline = (): void => {
    void playerProfileService.reconnectCloudSync();
  };

  private publish(): void {
    const snapshot = this.getSession();
    const serialized = JSON.stringify(snapshot);
    if (serialized === this.lastPublishedSerialized) return;
    this.lastPublishedSerialized = serialized;
    for (const listener of this.listeners) listener(snapshot);
  }
}
