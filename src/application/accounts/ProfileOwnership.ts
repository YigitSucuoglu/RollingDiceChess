import type { AccountId, GuestSessionId } from "../auth/AuthenticationContracts";

export type PlayerProfileId = string;

export type ProfileOwner =
  | { readonly kind: "guest"; readonly guestSessionId: GuestSessionId }
  | { readonly kind: "account"; readonly accountId: AccountId };

export interface AccountProfileAssociation {
  readonly accountId: AccountId;
  readonly playerProfileId: PlayerProfileId;
}

export interface GuestProfileMigrationCandidate {
  readonly accountId: AccountId;
  readonly localPlayerProfileId: PlayerProfileId;
}

export interface GuestProfileMigrationPort {
  discoverCandidate(
    accountId: AccountId,
  ): Promise<GuestProfileMigrationCandidate | null>;
}
