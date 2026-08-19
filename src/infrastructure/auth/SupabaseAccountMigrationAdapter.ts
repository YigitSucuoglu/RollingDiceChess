import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccountMigrationFailureCode,
  AccountMigrationListener,
  AccountMigrationPort,
  AccountMigrationState,
  MigrationProfileSummary,
  ProfileConflictResolution,
} from "../../application/accounts/AccountMigration";
import playerProfileService from "../../profile/PlayerProfileService";

const CONTINUATION_KEY = "roulettechess.account-migration.v1";

interface Continuation {
  readonly handoffToken: string;
  readonly phase: "linking" | "sign-in-existing";
  readonly accountAuthUserId?: string;
  readonly sourceAuthUserId?: string;
  readonly requestedResolution?: ProfileConflictResolution;
}

interface ContinuationStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface AccountMigrationProfileCoordinator {
  adoptCanonicalAfterAccountMigration(expectedPlayerId?: string): Promise<void>;
  hasProfileSyncConflict(): boolean;
  prepareForAccountMigration(): Promise<boolean>;
  resumeAfterAccountMigrationFailure(): void;
  suspendForAccountMigration(): void;
}

interface ConflictPayload {
  readonly status: "profile-conflict" | "resolved";
  readonly guest?: RawProfileSummary;
  readonly google?: RawProfileSummary;
  readonly survivingPlayerId?: string;
}

interface RawProfileSummary {
  readonly displayName: string;
  readonly gamesPlayed: number;
  readonly multiplayerRating: number;
  readonly totalXp: number;
}

function calculateLevel(totalXp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, totalXp) / 100)) + 1);
}

function normalizeSummary(value: RawProfileSummary): MigrationProfileSummary {
  return { ...value, level: calculateLevel(value.totalXp) };
}

function failureCode(message: string): AccountMigrationFailureCode {
  if (/expired|invalid migration/i.test(message)) return "intent-expired";
  return "temporarily-unavailable";
}

export class SupabaseAccountMigrationAdapter implements AccountMigrationPort {
  private readonly listeners = new Set<AccountMigrationListener>();
  private state: AccountMigrationState = { status: "idle" };
  private readonly client: SupabaseClient;
  private readonly origin: string;
  private readonly storage?: ContinuationStorage;
  private readonly profiles: AccountMigrationProfileCoordinator;

  public constructor(
    client: SupabaseClient,
    origin: string,
    storage: ContinuationStorage | undefined = typeof window === "undefined"
      ? undefined
      : window.sessionStorage,
    profiles: AccountMigrationProfileCoordinator = playerProfileService,
  ) {
    this.client = client;
    this.origin = origin;
    this.storage = storage;
    this.profiles = profiles;
  }

  public getState(): AccountMigrationState { return this.state; }

  public subscribe(listener: AccountMigrationListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public async startGuestUpgrade(): Promise<void> {
    if (!navigator.onLine) return this.fail("offline");
    if (this.profiles.hasProfileSyncConflict()) return this.fail("pending-progression");
    this.publish({ status: "pending", phase: "start" });
    if (!await this.profiles.prepareForAccountMigration()) {
      return this.fail("pending-progression");
    }
    this.profiles.suspendForAccountMigration();
    const { data, error } = await this.client.rpc("create_guest_upgrade_intent");
    const intent = Array.isArray(data) ? data[0] : data;
    if (error || !intent || typeof intent.handoff_token !== "string") {
      return this.fail("temporarily-unavailable");
    }
    const { data: sessionData } = await this.client.auth.getSession();
    const sourceAuthUserId = sessionData.session?.user.id;
    if (!sourceAuthUserId) return this.fail("temporarily-unavailable");
    this.writeContinuation({
      handoffToken: intent.handoff_token,
      phase: "linking",
      sourceAuthUserId,
    });
    const { error: linkError } = await this.client.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${this.origin}/profile` },
    });
    if (linkError) {
      this.clearContinuation();
      this.profiles.resumeAfterAccountMigrationFailure();
      this.fail("provider-failed");
    }
  }

  public async restoreContinuation(): Promise<boolean> {
    const continuation = this.readContinuation();
    if (!continuation) return false;
    this.profiles.suspendForAccountMigration();
    this.publish({ status: "pending", phase: "oauth-return" });
    const { data: sessionData } = await this.client.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return this.failAndReturn("provider-failed");

    if (continuation.accountAuthUserId && continuation.accountAuthUserId !== user.id) {
      this.clearLocalRecovery();
      return false;
    }
    if (user.is_anonymous && continuation.sourceAuthUserId
        && continuation.sourceAuthUserId !== user.id) {
      this.clearLocalRecovery();
      return false;
    }

    if (!user.is_anonymous) {
      const boundContinuation = continuation.accountAuthUserId
        ? continuation
        : { ...continuation, accountAuthUserId: user.id };
      this.writeContinuation(boundContinuation);
      if (continuation.phase === "linking") {
        const { data, error } = await this.client.rpc("complete_linked_guest_upgrade", {
          handoff_token: continuation.handoffToken,
        });
        if (!error) {
          try {
            await this.complete(typeof data === "string" ? data : undefined);
            return true;
          } catch {
            return this.failAndReturn("temporarily-unavailable");
          }
        }
      }
      return this.inspectConflict(boundContinuation);
    }

    if (continuation.phase === "linking") {
      this.writeContinuation({ ...continuation, phase: "sign-in-existing" });
      const { error } = await this.client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${this.origin}/profile` },
      });
      if (error) return this.failAndReturn("provider-failed");
      return true;
    }
    return this.failAndReturn("provider-failed");
  }

  public async resolveConflict(resolution: ProfileConflictResolution): Promise<void> {
    const continuation = this.readContinuation();
    if (!continuation) return this.fail("intent-expired");
    if (continuation.requestedResolution && continuation.requestedResolution !== resolution) {
      if (this.state.status === "profile-conflict") {
        this.publish({ ...this.state, failureCode: "resolution-failed" });
      }
      return;
    }
    const retryableContinuation = { ...continuation, requestedResolution: resolution };
    this.writeContinuation(retryableContinuation);
    const previous = this.state.status === "profile-conflict" ? this.state : undefined;
    this.publish({ status: "pending", phase: "resolve" });
    const { data, error } = await this.client.rpc("resolve_profile_conflict", {
      handoff_token: continuation.handoffToken,
      requested_resolution: resolution,
    });
    if (error) {
      const reconciled = await this.inspectConflict(retryableContinuation);
      if (reconciled && this.state.status === "completed") return;
      if (previous && this.state.status === "profile-conflict") {
        this.publish({ ...this.state, failureCode: "resolution-failed" });
      } else if (!reconciled) this.fail("resolution-failed");
      return;
    }
    try {
      await this.complete(typeof data === "string" ? data : undefined);
    } catch {
      if (previous) this.publish({ ...previous, failureCode: "resolution-failed" });
      else this.fail("resolution-failed");
    }
  }

  public cancelConflict(): void {
    if (this.state.status === "profile-conflict") this.publish(this.state);
  }

  public clearLocalRecovery(): void {
    this.clearContinuation();
    this.profiles.resumeAfterAccountMigrationFailure();
    this.publish({ status: "idle" });
  }

  public dispose(): void { this.listeners.clear(); }

  private async inspectConflict(continuation: Continuation): Promise<boolean> {
    const { data, error } = await this.client.rpc("inspect_profile_conflict", {
      handoff_token: continuation.handoffToken,
    });
    if (error) {
      if (/belongs to another account|invalid migration/i.test(error.message)) {
        this.clearLocalRecovery();
        return false;
      }
      return this.failAndReturn(failureCode(error.message));
    }
    const payload = data as unknown as ConflictPayload;
    if (payload.status === "resolved") {
      try {
        await this.complete(payload.survivingPlayerId);
        return true;
      } catch {
        return this.failAndReturn("temporarily-unavailable");
      }
    }
    if (!payload.guest || !payload.google) return this.failAndReturn("conflict-inspection-failed");
    this.publish({
      status: "profile-conflict",
      guest: normalizeSummary(payload.guest),
      google: normalizeSummary(payload.google),
    });
    return true;
  }

  private async complete(expectedPlayerId?: string): Promise<void> {
    await this.profiles.adoptCanonicalAfterAccountMigration(expectedPlayerId);
    this.clearContinuation();
    this.publish({ status: "completed" });
  }

  private readContinuation(): Continuation | undefined {
    try {
      const value = JSON.parse(this.storage?.getItem(CONTINUATION_KEY) ?? "null") as Partial<Continuation> | null;
      if (value && typeof value.handoffToken === "string"
          && (value.phase === "linking" || value.phase === "sign-in-existing")) {
        return {
          handoffToken: value.handoffToken,
          phase: value.phase,
          ...(typeof value.accountAuthUserId === "string"
            ? { accountAuthUserId: value.accountAuthUserId } : {}),
          ...(typeof value.sourceAuthUserId === "string"
            ? { sourceAuthUserId: value.sourceAuthUserId } : {}),
          ...(value.requestedResolution === "USE_GUEST_PROFILE"
              || value.requestedResolution === "USE_GOOGLE_PROFILE"
            ? { requestedResolution: value.requestedResolution } : {}),
        };
      }
    } catch { /* Invalid or denied storage is treated as no continuation. */ }
    return undefined;
  }

  private writeContinuation(value: Continuation): void {
    try { this.storage?.setItem(CONTINUATION_KEY, JSON.stringify(value)); }
    catch { this.fail("temporarily-unavailable"); }
  }

  private clearContinuation(): void {
    try { this.storage?.removeItem(CONTINUATION_KEY); } catch { /* no-op */ }
  }

  private fail(code: AccountMigrationFailureCode): void {
    this.publish({ status: "failed", failureCode: code });
  }

  private failAndReturn(code: AccountMigrationFailureCode): false {
    this.fail(code);
    return false;
  }

  private publish(state: AccountMigrationState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
