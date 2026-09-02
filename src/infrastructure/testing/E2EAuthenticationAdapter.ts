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
const E2E_PROFILE_OVERRIDE_KEY = "roulettechess.e2e-profile-override.v1";

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

type E2EAuthFixture = "account" | "cloud" | "local" | "onboarding" | "upgrade"
  | "conflict-guest" | "conflict-google" | "resolution-failure"
  | "recovery-unresolved" | "recovery-resolved-google" | "recovery-response-loss-google";

export function resolveE2EAuthFixture(value: string | null): E2EAuthFixture {
  return value === "account" || value === "cloud" || value === "onboarding"
    || value === "upgrade" || value === "conflict-guest"
    || value === "conflict-google" || value === "resolution-failure"
    || value === "recovery-unresolved" || value === "recovery-resolved-google"
    || value === "recovery-response-loss-google" ? value : "local";
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
  usernameOnboardingRequired = false,
  multiplayerStatistics: CloudProfileSnapshot["multiplayerStatistics"] = {
    rating: 1000, rankedGames: 0, rankedWins: 0,
    rankedLosses: 0, rankedWinRate: 0, unrankedGames: 0,
    currentRankedWinStreak: 0, bestRankedWinStreak: 0,
    totalMultiplayerPlayTimeMs: 0, multiplayerKingsCaptured: 0,
    multiplayerRouletteRolls: 0,
  },
): CloudProfileSnapshot {
  const profile = createDefaultPlayerProfile(new Date("2026-01-01T00:00:00.000Z"));
  profile.playerId = playerId;
  profile.displayName = displayName;
  profile.publicDiscriminator = playerId === FIXTURE_GOOGLE_PLAYER_ID ? "7K2M9" : "19F1P";
  profile.usernameOnboardingRequired = usernameOnboardingRequired;
  profile.totalXp = totalXp;
  profile.statistics.gamesPlayed = 1;
  profile.statistics.wins = 1;
  return {
    bootstrapApplied: false,
    playerId,
    profile,
    multiplayerRating: multiplayerStatistics.rating,
    multiplayerStatistics,
    rouletteStatistics: {
      mostRolledPiece: null, mostRolledPieceCount: 0,
      mostPlayedPiece: null, mostPlayedPieceCount: 0,
      threeRightsTurns: 0, playerTurnsCompleted: 0, threeRightsUsedRate: 0,
      tripleRolls: ["pawn", "knight", "bishop", "rook", "queen", "king"].map(
        (pieceType) => ({ pieceType: pieceType as keyof typeof profile.statistics.rollsByPiece, count: 0 }),
      ),
    },
  };
}

class E2ECloudPlayerSync implements CloudPlayerSyncPort {
  private snapshot: CloudProfileSnapshot;

  public constructor(fixture: E2EAuthFixture) {
    const result = readMigrationResult();
    this.snapshot = fixture === "onboarding"
      ? createE2ECloudSnapshot(FIXTURE_PLAYER_ID, "Guest1234", 50, true)
      : fixture === "account" || fixture === "recovery-resolved-google"
        ? createE2ECloudSnapshot(FIXTURE_GOOGLE_PLAYER_ID, "Yigit", 70, false, {
          rating: 1125, rankedGames: 7, rankedWins: 4,
          rankedLosses: 3, rankedWinRate: 0.571, unrankedGames: 5,
          currentRankedWinStreak: 2, bestRankedWinStreak: 4,
          totalMultiplayerPlayTimeMs: 125000, multiplayerKingsCaptured: 3,
          multiplayerRouletteRolls: 19,
        })
        : result === "google"
      ? createE2ECloudSnapshot(FIXTURE_GOOGLE_PLAYER_ID, "Player", 70)
      : createE2ECloudSnapshot(FIXTURE_PLAYER_ID, "Guest1234", 50, result === "guest");
    try {
      const override = JSON.parse(window.localStorage.getItem(E2E_PROFILE_OVERRIDE_KEY) ?? "null") as {
        displayName?: unknown; playerId?: unknown; usernameOnboardingRequired?: unknown;
      } | null;
      if (override?.playerId === this.snapshot.playerId && typeof override.displayName === "string") {
        this.snapshot.profile.displayName = override.displayName;
        this.snapshot.profile.usernameOnboardingRequired = override.usernameOnboardingRequired === true;
      }
    } catch { /* Invalid fixture state is ignored. */ }
  }

  public select(
    playerId: string,
    displayName: string,
    totalXp: number,
    usernameOnboardingRequired = false,
  ): void {
    this.snapshot = createE2ECloudSnapshot(
      playerId,
      displayName,
      totalXp,
      usernameOnboardingRequired,
    );
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

  public async renameCurrentPlayer(displayName: string): Promise<CloudProfileSnapshot> {
    this.snapshot.profile.displayName = displayName;
    this.snapshot.profile.usernameOnboardingRequired = false;
    try {
      window.localStorage.setItem(E2E_PROFILE_OVERRIDE_KEY, JSON.stringify({
        displayName,
        playerId: this.snapshot.playerId,
        usernameOnboardingRequired: false,
      }));
    } catch { /* The in-memory fixture remains canonical for this runtime. */ }
    return this.loadCurrent();
  }
}

class E2EAuthenticationAdapter implements AuthenticationPort {
  private readonly listeners = new Set<AuthenticationStateListener>();
  private session: AuthenticationSession;
  private readonly fixture: E2EAuthFixture;

  public constructor(fixture: E2EAuthFixture) {
    this.fixture = fixture;
    const recoveryAuthenticated = fixture === "recovery-unresolved"
      || fixture === "recovery-resolved-google" || fixture === "recovery-response-loss-google";
    const migrationResolved = readMigrationResult() !== null
      || fixture === "account" || fixture === "onboarding" || recoveryAuthenticated;
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
      const cloudSync = new E2ECloudPlayerSync(fixture);
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
    const migrationHandled = await accountMigrationService.restoreContinuation();
    if (!migrationHandled || accountMigrationService.getState().status === "completed") {
      await playerProfileService.handleAuthenticationSession(this.session);
    }
    return this.getSession();
  }

  public subscribe(listener: AuthenticationStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSession());
    return () => this.listeners.delete(listener);
  }

  public async chooseGuest(): Promise<AuthenticationSession> { return this.getSession(); }
  public async beginAuthentication(): Promise<AuthenticationSession> {
    if (this.fixture === "account" || this.fixture === "onboarding") this.authenticate();
    return this.getSession();
  }
  public async signOut(): Promise<AuthenticationSession> {
    this.session = { schemaVersion: AUTH_SESSION_SCHEMA_VERSION, state: {
      status: "unselected",
      guestSessionId: toGuestSessionId(`e2e-${this.fixture}-guest`),
    } };
    for (const listener of this.listeners) listener(this.getSession());
    return this.getSession();
  }
  public dispose(): void { this.listeners.clear(); }

  private authenticate(): void {
    this.session = { schemaVersion: AUTH_SESSION_SCHEMA_VERSION, state: {
      status: "authenticated", account: { accountId: toAccountId("e2e-google-account"), provider: "google" },
    } };
    void playerProfileService.handleAuthenticationSession(this.session);
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
      this.cloudSync.select(FIXTURE_PLAYER_ID, "Guest1234", 50, true);
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
  public async restoreContinuation(): Promise<boolean> {
    if (this.fixture === "recovery-resolved-google") {
      this.cloudSync.select(FIXTURE_GOOGLE_PLAYER_ID, "Yigit", 70);
      await playerProfileService.adoptCanonicalAfterAccountMigration(FIXTURE_GOOGLE_PLAYER_ID);
      this.publish({ status: "completed" });
      return true;
    }
    if (this.fixture === "recovery-unresolved" || this.fixture === "recovery-response-loss-google") {
      playerProfileService.suspendForAccountMigration();
      this.publish({ status: "profile-conflict",
        guest: { displayName: "Guest6660", gamesPlayed: 2, level: 2, totalXp: 136, multiplayerRating: 1000 },
        google: { displayName: "Yigit", gamesPlayed: 2, level: 2, totalXp: 136, multiplayerRating: 1000 },
      });
      return true;
    }
    return false;
  }
  public async resolveConflict(resolution: ProfileConflictResolution): Promise<void> {
    if (this.fixture === "recovery-response-loss-google" && !this.resolutionFailedOnce) {
      this.resolutionFailedOnce = true;
      writeMigrationResult("google");
      if (this.state.status === "profile-conflict") {
        this.publish({ ...this.state, failureCode: "resolution-failed" });
      }
      return;
    }
    if (this.fixture === "recovery-response-loss-google" && readMigrationResult() === "google") {
      this.cloudSync.select(FIXTURE_GOOGLE_PLAYER_ID, "Yigit", 70);
      await playerProfileService.adoptCanonicalAfterAccountMigration(FIXTURE_GOOGLE_PLAYER_ID);
      this.publish({ status: "completed" });
      return;
    }
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
      !keepGoogle,
    );
    writeMigrationResult(keepGoogle ? "google" : "guest");
    await playerProfileService.adoptCanonicalAfterAccountMigration(
      keepGoogle ? FIXTURE_GOOGLE_PLAYER_ID : FIXTURE_PLAYER_ID,
    );
    this.authenticate(); this.publish({ status: "completed" });
  }
  public cancelConflict(): void { if (this.state.status === "profile-conflict") this.publish(this.state); }
  public clearLocalRecovery(): void { this.publish({ status: "idle" }); }
  public dispose(): void { this.listeners.clear(); }
  private publish(state: AccountMigrationState): void { this.state = state; for (const listener of this.listeners) listener(state); }
}

export function createE2EAuthentication(): AuthenticationPort {
  return new E2EAuthenticationAdapter(readFixture());
}
