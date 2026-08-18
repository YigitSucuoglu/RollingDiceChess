import type {
  CloudPlayerProfile,
  PlayerId,
  ProfileConflictResolution,
} from "./PlayerContracts";

export interface MigrationModelState {
  readonly guest: CloudPlayerProfile;
  readonly google: CloudPlayerProfile;
  readonly completedResolution?: ProfileConflictResolution;
  readonly survivingPlayerId?: PlayerId;
}

export function resolveProfileConflictModel(
  state: MigrationModelState,
  resolution: ProfileConflictResolution,
): MigrationModelState {
  if (state.completedResolution) {
    if (state.completedResolution !== resolution) {
      throw new Error("Profile conflict was already resolved with a different choice.");
    }
    return state;
  }

  if (state.guest.lifecycle !== "active" || state.google.lifecycle !== "active") {
    throw new Error("Both profiles must be active before conflict resolution.");
  }

  if (resolution === "USE_GOOGLE_PROFILE") {
    return {
      guest: { ...state.guest, lifecycle: "retired" },
      google: state.google,
      completedResolution: resolution,
      survivingPlayerId: state.google.playerId,
    };
  }

  return {
    guest: {
      ...state.guest,
      ownership: state.google.ownership,
      usernameOnboardingRequired:
        state.guest.usernameOnboardingRequired
        || /^Guest\d{4}$/iu.test(state.guest.displayName),
    },
    google: { ...state.google, lifecycle: "retired" },
    completedResolution: resolution,
    survivingPlayerId: state.guest.playerId,
  };
}
