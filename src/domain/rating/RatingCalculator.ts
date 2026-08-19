import type { PlayerId } from "../contracts/PlayerIdentity";
import type { RatingParticipant } from "./RatingContracts";

export const RATING_BASE_MOVEMENT = 15;
export const RATING_DIFFERENCE_CAP = 200;
export const RATING_DIFFERENCE_DIVISOR = 20;
export const RATING_MINIMUM = 0;
export const RATING_MIN_MOVEMENT = 5;
export const RATING_MAX_MOVEMENT = 25;

export interface CalculateRatingChangeInput {
  readonly playerAId: PlayerId;
  readonly playerBId: PlayerId;
  readonly playerARating: number;
  readonly playerBRating: number;
  readonly winner: RatingParticipant;
}

export interface RatingChange {
  readonly movement: number;
  readonly effectiveDifference: number;
  readonly playerADelta: number;
  readonly playerBDelta: number;
  readonly playerANewRating: number;
  readonly playerBNewRating: number;
  readonly floorApplied: boolean;
  readonly isZeroSum: boolean;
}

function assertRating(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < RATING_MINIMUM) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

/**
 * Positive values only are rounded, so Math.round and PostgreSQL round(numeric)
 * both resolve .5 toward the next positive integer.
 */
export function calculateRatingChange(input: CalculateRatingChangeInput): RatingChange {
  if (input.playerAId === input.playerBId) {
    throw new Error("A rated match requires two distinct PlayerIds.");
  }
  assertRating(input.playerARating, "playerARating");
  assertRating(input.playerBRating, "playerBRating");

  const effectiveDifference = Math.min(
    Math.abs(input.playerARating - input.playerBRating),
    RATING_DIFFERENCE_CAP,
  );
  const ratingsAreEqual = input.playerARating === input.playerBRating;
  const higherRated = input.playerARating > input.playerBRating ? "playerA" : "playerB";
  const favoriteWon = !ratingsAreEqual && input.winner === higherRated;
  const direction = ratingsAreEqual ? 0 : favoriteWon ? -1 : 1;
  const movement = Math.round(
    RATING_BASE_MOVEMENT
      + direction * (effectiveDifference / RATING_DIFFERENCE_DIVISOR),
  );

  const winnerRating = input.winner === "playerA"
    ? input.playerARating
    : input.playerBRating;
  const loserRating = input.winner === "playerA"
    ? input.playerBRating
    : input.playerARating;
  const winnerNewRating = winnerRating + movement;
  if (!Number.isSafeInteger(winnerNewRating)) {
    throw new Error("The resulting winner rating exceeds the supported integer range.");
  }
  const loserNewRating = Math.max(RATING_MINIMUM, loserRating - movement);
  const winnerDelta = movement;
  const loserDelta = loserNewRating - loserRating;
  const floorApplied = loserDelta !== -movement;

  const playerADelta = input.winner === "playerA" ? winnerDelta : loserDelta;
  const playerBDelta = input.winner === "playerB" ? winnerDelta : loserDelta;

  return {
    movement,
    effectiveDifference,
    playerADelta,
    playerBDelta,
    playerANewRating: input.playerARating + playerADelta,
    playerBNewRating: input.playerBRating + playerBDelta,
    floorApplied,
    isZeroSum: playerADelta + playerBDelta === 0,
  };
}
