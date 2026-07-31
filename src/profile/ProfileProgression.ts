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

export interface XpProgressionSnapshot extends LevelProgression {
  readonly title: string;
  readonly titleId: PlayerTitleId;
}

export interface XpAnimationSegment {
  readonly level: number;
  readonly title: string;
  readonly titleId: PlayerTitleId;
  readonly fromXp: number;
  readonly toXp: number;
  readonly requiredXp: number;
  readonly completesLevel: boolean;
}

export type PlayerTitleId = "novice" | "apprentice" | "strategist" | "mastermind" | "grandmaster" | "legend" | "rouletteMaster";

export function resolvePlayerTitleId(level: number): PlayerTitleId {
  if (level >= 100) return "rouletteMaster";
  if (level >= 80) return "legend";
  if (level >= 60) return "grandmaster";
  if (level >= 40) return "mastermind";
  if (level >= 20) return "strategist";
  if (level >= 10) return "apprentice";
  return "novice";
}

export interface MatchXpProgressionResult {
  readonly earnedXp: number;
  readonly previous: XpProgressionSnapshot;
  readonly current: XpProgressionSnapshot;
  readonly segments: readonly XpAnimationSegment[];
  readonly leveledUp: boolean;
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
  const titles: Record<PlayerTitleId, string> = { novice: "Novice", apprentice: "Apprentice", strategist: "Strategist", mastermind: "Mastermind", grandmaster: "Grandmaster", legend: "Legend", rouletteMaster: "Roulette Master" };
  return titles[resolvePlayerTitleId(level)];
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

function createProgressionSnapshot(totalXp: number): XpProgressionSnapshot {
  const progression = calculateLevelProgression(totalXp);

  return {
    ...progression,
    title: resolvePlayerTitle(progression.level),
    titleId: resolvePlayerTitleId(progression.level),
  };
}

export function createMatchXpProgressionResult(
  previousTotalXp: number,
  earnedXp: number
): MatchXpProgressionResult {
  const safePreviousXp = Math.max(0, previousTotalXp);
  const safeEarnedXp = Math.max(0, earnedXp);
  const previous = createProgressionSnapshot(safePreviousXp);
  const current = createProgressionSnapshot(
    safePreviousXp + safeEarnedXp
  );
  const segments: XpAnimationSegment[] = [];

  for (let level = previous.level; level <= current.level; level++) {
    const requiredXp = getRequiredXpForLevel(level);
    const isFirst = level === previous.level;
    const isLast = level === current.level;

    segments.push({
      level,
      title: resolvePlayerTitle(level),
      titleId: resolvePlayerTitleId(level),
      fromXp: isFirst ? previous.currentLevelXp : 0,
      toXp: isLast ? current.currentLevelXp : requiredXp,
      requiredXp,
      completesLevel: !isLast,
    });
  }

  return {
    earnedXp: safeEarnedXp,
    previous,
    current,
    segments,
    leveledUp: current.level > previous.level,
  };
}
