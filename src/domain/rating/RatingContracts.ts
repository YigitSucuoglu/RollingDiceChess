import type { PlayerId } from "../contracts/PlayerIdentity";

export type RatingParticipant = "playerA" | "playerB";
export type RatingMatchMode = "bot" | "multiplayer-unranked" | "multiplayer-ranked";
export type RatingTerminationReason = "normal" | "forfeit" | "technical-abort";

/** Trusted match-finalization input. Browser actions must never construct or settle this contract. */
export interface AuthoritativeMatchRatingResult {
  readonly matchId: string;
  readonly mode: RatingMatchMode;
  readonly playerAId: PlayerId;
  readonly playerBId: PlayerId;
  readonly winner: RatingParticipant | null;
  readonly terminationReason: RatingTerminationReason;
}

export type RatingIneligibilityReason = "bot" | "unranked" | "technical-abort";

export type RatingEligibility =
  | { readonly eligible: true; readonly winner: RatingParticipant }
  | { readonly eligible: false; readonly reason: RatingIneligibilityReason };

export function resolveRatingEligibility(
  result: AuthoritativeMatchRatingResult,
): RatingEligibility {
  if (result.playerAId === result.playerBId) {
    throw new Error("A rated match requires two distinct PlayerIds.");
  }
  if (!result.matchId.trim()) {
    throw new Error("An authoritative match id is required.");
  }
  if (result.terminationReason === "technical-abort") {
    if (result.winner !== null) {
      throw new Error("A technical abort cannot declare a winner.");
    }
    return { eligible: false, reason: "technical-abort" };
  }
  if (result.winner === null) {
    throw new Error("A completed or forfeited match requires a winner.");
  }
  if (result.mode === "bot") return { eligible: false, reason: "bot" };
  if (result.mode === "multiplayer-unranked") {
    return { eligible: false, reason: "unranked" };
  }
  return { eligible: true, winner: result.winner };
}
