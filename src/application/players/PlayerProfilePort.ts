import type {
  CloudPlayerProfile,
  LocalProfileBootstrapCandidate,
  PlayerProfileConflict,
  ProfileConflictResolution,
} from "./PlayerContracts";

export interface PlayerProfilePort {
  getCurrentPlayer(): Promise<CloudPlayerProfile | null>;
  bootstrapLocalProfile(candidate: LocalProfileBootstrapCandidate): Promise<CloudPlayerProfile>;
  renameCurrentPlayer(displayName: string): Promise<CloudPlayerProfile>;
  inspectProfileConflict(conflictId: string): Promise<PlayerProfileConflict | null>;
  resolveProfileConflict(
    conflictId: string,
    resolution: ProfileConflictResolution,
  ): Promise<CloudPlayerProfile>;
}

// Rating mutation is intentionally absent. Future ranked-match authority owns it.
