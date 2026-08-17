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
import accountMigrationService from "../../application/accounts/AccountMigrationService";
import type { AccountMigrationListener, AccountMigrationPort, AccountMigrationState, ProfileConflictResolution } from "../../application/accounts/AccountMigration";
import { toAccountId } from "../../application/auth/AuthenticationContracts";
import type {
  CloudPlayerSyncPort,
  CloudProfileSnapshot,
} from "../../profile/PlayerSync";

export const E2E_AUTH_FIXTURE_STORAGE_KEY = "roulettechess.e2e-auth-fixture.v1";
const FIXTURE_PLAYER_ID = "12345678-1234-4123-8123-123456789012";
const FIXTURE_GOOGLE_PLAYER_ID = "87654321-4321-4321-8321-210987654321";
const E2E_MIGRATION_RESULT_KEY = "roulettechess.e2e-migration-result.v1";

function readMigrationResult(): "google" | "guest" | null {
  try {
    const value = window.localStorage.getItem(E2E_MIGRATION_RESULT_KEY);
    return value === "google" || value === "guest" ? value : null;
  } catch {
    return null;
  }
}

function writeMigrationResult(value: "google" | "guest"): void {
  try { window.localStorage.setItem(E2E_MIGRATION_RESULT_KEY, value); }
  catch { /* Storage-denial E2E deliberately keeps the result runtime-only. */ }
}

type E2EAuthFixture = "cloud" | "local" | "upgrade" | "conflict-guest" | "conflict-google" | "resolution-failure";

export function resolveE2EAuthFixture(value: string | null): E2EAuthFixture {
  return value === "cloud" || value === "upgrade" || value === "conflict-guest"
    || value === "conflict-google" || value === "resolution-failure" ? value : "local";
}

function readFixture(): E2EAuthFixture {
  try {
    return resolveE2EAuthFixture(window.localStorage.getItem(E2E_AUTH_FIXTURE_STORAGE_KEY));
  } catch {
    return "local";
  }
}

export function createE2ECloudSnapshot(
  playerId = FIXTURE_PLAYER_ID,
  displayName = "Guest1234",
  totalXp = 50,
): CloudProfileSnapshot {
  const profile = createDefaultPlayerProfile(new Date("2026-01-01T00:00:00.000Z"));
  profile.playerId = playerId;
  profile.displayName = displayName;
  profile.totalXp = totalXp;
  profile.statistics.gamesPlayed = 1;
  profile.statistics.wins = 1;
  return {
    bootstrapApplied: false,
    playerId,
    profile,
    multiplayerRating: 1000,
  };
}

class E2ECloudPlayerSync implements CloudPlayerSyncPort {
  private snapshot: CloudProfileSnapshot;

  public constructor() {
    const result = readMigrationResult();
    this.snapshot = result === "google"
      ? createE2ECloudSnapshot(FIXTURE_GOOGLE_PLAYER_ID, "Player", 70)
      : createE2ECloudSnapshot();
  }

  public select(playerId: string, displayName: string, totalXp: number): void {
    this.snapshot = createE2ECloudSnapshot(playerId, displayName, totalXp);
  }

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
  private session: AuthenticationSession;

  public constructor(fixture: E2EAuthFixture) {
    const migrationResolved = readMigrationResult() !== null;
    this.session = migrationResolved ? {
      schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
      state: { status: "authenticated", account: {
        accountId: toAccountId("e2e-google-account"), provider: "google",
      } },
    } : {
      schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
      state: {
        status: "guest",
        guestSessionId: toGuestSessionId(`e2e-${fixture}-guest`),
        persistence: fixture === "local" ? "local" : "cloud",
      },
    };
    if (fixture !== "local") {
      const cloudSync = new E2ECloudPlayerSync();
      playerProfileService.configureCloudSync(cloudSync, window.localStorage);
      accountMigrationService.configure(new E2EAccountMigrationAdapter(
        fixture,
        cloudSync,
        () => this.authenticate(),
      ));
    }
  }

  public isAuthenticationAvailable(): boolean { return this.session.state.status !== "guest" || this.session.state.persistence === "cloud"; }
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

  private authenticate(): void {
    this.session = { schemaVersion: AUTH_SESSION_SCHEMA_VERSION, state: {
      status: "authenticated", account: { accountId: toAccountId("e2e-google-account"), provider: "google" },
    } };
    for (const listener of this.listeners) listener(this.getSession());
  }
}

class E2EAccountMigrationAdapter implements AccountMigrationPort {
  private readonly listeners = new Set<AccountMigrationListener>();
  private state: AccountMigrationState = { status: "idle" };
  private readonly fixture: E2EAuthFixture;
  private readonly cloudSync: E2ECloudPlayerSync;
  private readonly authenticate: () => void;
  private resolutionFailedOnce = false;
  public constructor(fixture: E2EAuthFixture, cloudSync: E2ECloudPlayerSync, authenticate: () => void) {
    this.fixture = fixture;
    this.cloudSync = cloudSync;
    this.authenticate = authenticate;
  }
  public getState(): AccountMigrationState { return this.state; }
  public subscribe(listener: AccountMigrationListener): () => void { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  public async startGuestUpgrade(): Promise<void> {
    playerProfileService.suspendForAccountMigration();
    if (this.fixture === "upgrade") {
      writeMigrationResult("guest");
      await playerProfileService.adoptCanonicalAfterAccountMigration(FIXTURE_PLAYER_ID);
      this.authenticate();
      this.publish({ status: "completed" });
      return;
    }
    this.publish({ status: "profile-conflict",
      guest: { displayName: "Guest1234", gamesPlayed: 120, level: 20, totalXp: 8500, multiplayerRating: 1000 },
      google: { displayName: "Player", gamesPlayed: 30, level: 8, totalXp: 2700, multiplayerRating: 1000 },
    });
  }
  public async restoreContinuation(): Promise<boolean> { return false; }
  public async resolveConflict(resolution: ProfileConflictResolution): Promise<void> {
    if (this.fixture === "resolution-failure" && !this.resolutionFailedOnce) {
      this.resolutionFailedOnce = true;
      if (this.state.status === "profile-conflict") {
        this.publish({ ...this.state, failureCode: "resolution-failed" });
      }
      return;
    }
    if ((this.fixture === "conflict-guest" && resolution !== "USE_GUEST_PROFILE")
        || (this.fixture === "conflict-google" && resolution !== "USE_GOOGLE_PROFILE")) return;
    const keepGoogle = resolution === "USE_GOOGLE_PROFILE";
    this.cloudSync.select(
      keepGoogle ? FIXTURE_GOOGLE_PLAYER_ID : FIXTURE_PLAYER_ID,
      keepGoogle ? "Player" : "Guest1234",
      keepGoogle ? 70 : 50,
    );
    writeMigrationResult(keepGoogle ? "google" : "guest");
    await playerProfileService.adoptCanonicalAfterAccountMigration(
      keepGoogle ? FIXTURE_GOOGLE_PLAYER_ID : FIXTURE_PLAYER_ID,
    );
    this.authenticate(); this.publish({ status: "completed" });
  }
  public cancelConflict(): void { if (this.state.status === "profile-conflict") this.publish(this.state); }
  public dispose(): void { this.listeners.clear(); }
  private publish(state: AccountMigrationState): void { this.state = state; for (const listener of this.listeners) listener(state); }
}

export function createE2EAuthentication(): AuthenticationPort {
  return new E2EAuthenticationAdapter(readFixture());
}
