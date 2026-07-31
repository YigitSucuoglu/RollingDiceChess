import type { PlayerProfile } from "./PlayerProfile";

export interface PlayerProfileRepository {
  getProfile(): PlayerProfile;
  saveProfile(profile: PlayerProfile): void;
  resetProfile(): PlayerProfile;
}
