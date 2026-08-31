export const RATING_ANIMATION_DURATION_MS = 1_100;

export function interpolateRating(before: number, after: number, progress: number): number {
  const boundedProgress = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - boundedProgress) ** 3;
  return Math.round(before + (after - before) * eased);
}
