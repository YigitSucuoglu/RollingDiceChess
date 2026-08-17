export type ProfileConflictResolution =
  | "USE_GUEST_PROFILE"
  | "USE_GOOGLE_PROFILE";

export interface MigrationProfileSummary {
  readonly displayName: string;
  readonly gamesPlayed: number;
  readonly level: number;
  readonly multiplayerRating: number;
  readonly totalXp: number;
}

export type AccountMigrationFailureCode =
  | "conflict-inspection-failed"
  | "intent-expired"
  | "local-guest"
  | "offline"
  | "pending-progression"
  | "provider-failed"
  | "resolution-failed"
  | "temporarily-unavailable";

export type AccountMigrationState =
  | { readonly status: "idle" }
  | { readonly status: "pending"; readonly phase: "start" | "oauth-return" | "resolve" }
  | {
      readonly status: "profile-conflict";
      readonly guest: MigrationProfileSummary;
      readonly google: MigrationProfileSummary;
      readonly failureCode?: AccountMigrationFailureCode;
    }
  | { readonly status: "completed" }
  | { readonly status: "failed"; readonly failureCode: AccountMigrationFailureCode };

export type AccountMigrationListener = (state: AccountMigrationState) => void;

export interface AccountMigrationPort {
  getState(): AccountMigrationState;
  subscribe(listener: AccountMigrationListener): () => void;
  startGuestUpgrade(): Promise<void>;
  restoreContinuation(): Promise<boolean>;
  resolveConflict(resolution: ProfileConflictResolution): Promise<void>;
  cancelConflict(): void;
  dispose(): void;
}
