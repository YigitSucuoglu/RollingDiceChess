import type { AchievementId } from "../../domain/achievements/AchievementContracts";
import { ACHIEVEMENT_DEFINITIONS } from "../../domain/achievements/AchievementCatalog";
import type { CloudProfileSnapshot } from "../../profile/PlayerSync";

export const PROGRESS_ACHIEVEMENT_IDS = [
  "rookie_campaign", "hundred_games", "dedicated_player", "king_hunter", "capture_hundred_kings",
  "ranked_victor", "ranked_regular", "ranked_veteran", "wheel_spinner", "roulette_master",
  "roll_collector", "triple_collector", "pawn_commander", "knight_specialist", "royal_maneuvers",
] as const satisfies readonly AchievementId[];

export interface AchievementProgress {
  readonly current: number;
  readonly target: number;
  readonly percent: number;
  readonly recordedOnly: boolean;
}

function counter(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sumCounters(values: readonly unknown[]): number | null {
  let result = 0;
  for (const value of values) {
    const next = counter(value);
    if (next === null || !Number.isSafeInteger(result + next)) return null;
    result += next;
  }
  return result;
}

export function selectAchievementProgress(
  id: AchievementId,
  snapshot: CloudProfileSnapshot | null,
): AchievementProgress | null {
  if (!snapshot || !PROGRESS_ACHIEVEMENT_IDS.includes(id as typeof PROGRESS_ACHIEVEMENT_IDS[number])) return null;
  const sp = snapshot.profile.statistics;
  const mp = snapshot.multiplayerStatistics;
  const global = snapshot.rouletteStatistics;
  let current: number | null;
  switch (id) {
    case "rookie_campaign": case "hundred_games": case "dedicated_player": current = counter(sp.gamesPlayed); break;
    case "king_hunter": case "capture_hundred_kings": current = counter(sp.kingsCaptured); break;
    case "ranked_victor": current = counter(mp.rankedWins); break;
    case "ranked_regular": case "ranked_veteran": current = counter(mp.rankedGames); break;
    case "wheel_spinner": case "roulette_master": case "roll_collector":
      current = sumCounters([sp.rouletteRolls, mp.multiplayerRouletteRolls]); break;
    case "triple_collector":
      current = global.tripleRolls?.length === 6 ? sumCounters(global.tripleRolls.map((item) => item.count)) : null; break;
    case "pawn_commander": current = counter(global.movesByPiece?.pawn); break;
    case "knight_specialist": current = counter(global.movesByPiece?.knight); break;
    case "royal_maneuvers": current = counter(global.movesByPiece?.king); break;
    default: return null;
  }
  const target = counter(ACHIEVEMENT_DEFINITIONS[id].target);
  if (current === null || target === null || target === 0) return null;
  return { current, target, percent: Math.min(100, current / target * 100),
    recordedOnly: id === "wheel_spinner" || id === "roulette_master" || id === "roll_collector"
      || id === "triple_collector" || id === "pawn_commander" || id === "knight_specialist"
      || id === "royal_maneuvers" };
}
