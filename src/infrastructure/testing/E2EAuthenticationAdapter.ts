import {
  AUTH_SESSION_SCHEMA_VERSION,
  cloneAuthenticationSession,
  toGuestSessionId,
  type AuthenticationSession,
} from "../../application/auth/AuthenticationContracts";
import type {
  AuthenticationPort,
  AuthenticationStateListener,
} from "../../application/auth/AuthenticationPort";
import { createDefaultPlayerProfile } from "../../profile/PlayerProfile";
import playerProfileService from "../../profile/PlayerProfileService";
import type {
  CloudPlayerSyncPort,
  CloudProfileSnapshot,
} from "../../profile/PlayerSync";

export const E2E_AUTH_FIXTURE_STORAGE_KEY = "roulettechess.e2e-auth-fixture.v1";
const FIXTURE_PLAYER_ID = "12345678-1234-4123-8123-123456789012";

type E2EAuthFixture = "cloud" | "local";

export function resolveE2EAuthFixture(value: string | null): E2EAuthFixture {
  return value === "cloud" ? "cloud" : "local";
}

function readFixture(): E2EAuthFixture {
  try {
    return resolveE2EAuthFixture(window.localStorage.getItem(E2E_AUTH_FIXTURE_STORAGE_KEY));
  } catch {
    return "local";
  }
}

export function createE2ECloudSnapshot(): CloudProfileSnapshot {
  const profile = createDefaultPlayerProfile(new Date("2026-01-01T00:00:00.000Z"));
  profile.playerId = FIXTURE_PLAYER_ID;
  profile.displayName = "Guest1234";
  return {
    bootstrapApplied: false,
    playerId: FIXTURE_PLAYER_ID,
    profile,
    multiplayerRating: 1000,
  };
}

class E2ECloudPlayerSync implements CloudPlayerSyncPort {
  private snapshot = createE2ECloudSnapshot();

  public async loadCurrent(): Promise<CloudProfileSnapshot> {
    return structuredClone(this.snapshot);
  }

  public async bootstrap(): Promise<CloudProfileSnapshot> {
    return this.loadCurrent();
  }

  public async applyOperation(): Promise<CloudProfileSnapshot> {
    return this.loadCurrent();
  }
}

class E2EAuthenticationAdapter implements AuthenticationPort {
  private readonly listeners = new Set<AuthenticationStateListener>();
  private readonly session: AuthenticationSession;

  public constructor(fixture: E2EAuthFixture) {
    this.session = {
      schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
      state: {
        status: "guest",
        guestSessionId: toGuestSessionId(`e2e-${fixture}-guest`),
        persistence: fixture,
      },
    };
    if (fixture === "cloud") {
      playerProfileService.configureCloudSync(new E2ECloudPlayerSync(), window.localStorage);
    }
  }

  public isAuthenticationAvailable(): boolean { return false; }
  public getSession(): AuthenticationSession { return cloneAuthenticationSession(this.session); }

  public async restoreSession(): Promise<AuthenticationSession> {
    await playerProfileService.handleAuthenticationSession(this.session);
    return this.getSession();
  }

  public subscribe(listener: AuthenticationStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSession());
    return () => this.listeners.delete(listener);
  }

  public async chooseGuest(): Promise<AuthenticationSession> { return this.getSession(); }
  public async beginAuthentication(): Promise<AuthenticationSession> { return this.getSession(); }
  public async signOut(): Promise<AuthenticationSession> { return this.getSession(); }
  public dispose(): void { this.listeners.clear(); }
}

export function createE2EAuthentication(): AuthenticationPort {
  return new E2EAuthenticationAdapter(readFixture());
}
