import type { BotDifficulty } from "../types/GameSetup";

export interface LevelProgression {
  readonly level: number;
  readonly currentLevelXp: number;
  readonly requiredXp: number;
  readonly progressPercent: number;
}

export interface XpRewardBreakdown {
  readonly resultXp: number;
  readonly promotionXp: number;
  readonly streakXp: number;
  readonly difficultyMultiplier: number;
  readonly finalXp: number;
}

const DIFFICULTY_MULTIPLIERS: Readonly<Record<BotDifficulty, number>> = {
  easy: 0.8,
  medium: 1,
  hard: 1.2,
};

export function getRequiredXpForLevel(level: number): number {
  return 100 + (Math.max(1, Math.floor(level)) - 1) * 30;
}

export function calculateLevelProgression(totalXp: number): LevelProgression {
  let remainingXp = Math.max(0, Number.isFinite(totalXp) ? totalXp : 0);
  let level = 1;
  let requiredXp = getRequiredXpForLevel(level);

  while (remainingXp >= requiredXp) {
    remainingXp -= requiredXp;
    level++;
    requiredXp = getRequiredXpForLevel(level);
  }

  const currentLevelXp = Math.floor(remainingXp);

  return {
    level,
    currentLevelXp,
    requiredXp,
    progressPercent: Math.min(
      100,
      Math.max(0, (currentLevelXp / requiredXp) * 100)
    ),
  };
}

export function resolvePlayerTitle(level: number): string {
  if (level >= 100) return "Roulette Master";
  if (level >= 80) return "Legend";
  if (level >= 60) return "Grandmaster";
  if (level >= 40) return "Mastermind";
  if (level >= 20) return "Strategist";
  if (level >= 10) return "Apprentice";
  return "Novice";
}

export function calculateWinStreakBonus(currentWinStreak: number): number {
  return Math.min(Math.max(currentWinStreak - 1, 0) * 5, 25);
}

export function calculateXpReward(input: {
  readonly won: boolean;
  readonly promotions: number;
  readonly currentWinStreak: number;
  readonly difficulty: BotDifficulty;
}): XpRewardBreakdown {
  const resultXp = input.won ? 50 : 25;
  const promotionXp = Math.max(0, input.promotions) * 10;
  const streakXp = input.won
    ? calculateWinStreakBonus(input.currentWinStreak)
    : 0;
  const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[input.difficulty];

  return {
    resultXp,
    promotionXp,
    streakXp,
    difficultyMultiplier,
    finalXp: Math.round(
      (resultXp + promotionXp + streakXp) * difficultyMultiplier
    ),
  };
}
