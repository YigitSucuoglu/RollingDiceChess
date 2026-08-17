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

  public constructor(
    client: SupabaseClient,
    origin: string,
  ) {
    this.client = client;
    this.origin = origin;
  }

  public getState(): AccountMigrationState { return this.state; }

  public subscribe(listener: AccountMigrationListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public async startGuestUpgrade(): Promise<void> {
    if (!navigator.onLine) return this.fail("offline");
    if (playerProfileService.hasProfileSyncConflict()) return this.fail("pending-progression");
    this.publish({ status: "pending", phase: "start" });
    if (!await playerProfileService.prepareForAccountMigration()) {
      return this.fail("pending-progression");
    }
    playerProfileService.suspendForAccountMigration();
    const { data, error } = await this.client.rpc("create_guest_upgrade_intent");
    const intent = Array.isArray(data) ? data[0] : data;
    if (error || !intent || typeof intent.handoff_token !== "string") {
      return this.fail("temporarily-unavailable");
    }
    this.writeContinuation({ handoffToken: intent.handoff_token, phase: "linking" });
    const { error: linkError } = await this.client.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${this.origin}/profile` },
    });
    if (linkError) {
      this.clearContinuation();
      playerProfileService.resumeAfterAccountMigrationFailure();
      this.fail("provider-failed");
    }
  }

  public async restoreContinuation(): Promise<boolean> {
    const continuation = this.readContinuation();
    if (!continuation) return false;
    playerProfileService.suspendForAccountMigration();
    this.publish({ status: "pending", phase: "oauth-return" });
    const { data: sessionData } = await this.client.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return this.failAndReturn("provider-failed");

    if (!user.is_anonymous) {
      if (continuation.phase === "linking") {
        const { data, error } = await this.client.rpc("complete_linked_guest_upgrade", {
          handoff_token: continuation.handoffToken,
        });
        if (!error) {
          await this.complete(typeof data === "string" ? data : undefined);
          return true;
        }
        if (!/guest ownership|already linked|account player/i.test(error.message)) {
          return this.failAndReturn(failureCode(error.message));
        }
      }
      return this.inspectConflict(continuation.handoffToken);
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
    this.publish({ status: "pending", phase: "resolve" });
    const previous = this.state.status === "profile-conflict" ? this.state : undefined;
    const { data, error } = await this.client.rpc("resolve_profile_conflict", {
      handoff_token: continuation.handoffToken,
      requested_resolution: resolution,
    });
    if (error) {
      if (previous) this.publish({ ...previous, failureCode: "resolution-failed" });
      else this.fail("resolution-failed");
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

  public dispose(): void { this.listeners.clear(); }

  private async inspectConflict(handoffToken: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("inspect_profile_conflict", {
      handoff_token: handoffToken,
    });
    if (error) return this.failAndReturn(failureCode(error.message));
    const payload = data as unknown as ConflictPayload;
    if (payload.status === "resolved") {
      await this.complete(payload.survivingPlayerId);
      return true;
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
    await playerProfileService.adoptCanonicalAfterAccountMigration(expectedPlayerId);
    this.clearContinuation();
    this.publish({ status: "completed" });
  }

  private readContinuation(): Continuation | undefined {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(CONTINUATION_KEY) ?? "null") as Partial<Continuation> | null;
      if (value && typeof value.handoffToken === "string"
          && (value.phase === "linking" || value.phase === "sign-in-existing")) {
        return value as Continuation;
      }
    } catch { /* Invalid or denied storage is treated as no continuation. */ }
    return undefined;
  }

  private writeContinuation(value: Continuation): void {
    try { window.sessionStorage.setItem(CONTINUATION_KEY, JSON.stringify(value)); }
    catch { this.fail("temporarily-unavailable"); }
  }

  private clearContinuation(): void {
    try { window.sessionStorage.removeItem(CONTINUATION_KEY); } catch { /* no-op */ }
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
