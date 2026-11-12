import { ACHIEVEMENT_CATALOG } from "./AchievementCatalog";
import {
  type AchievementDefinition,
  type AchievementEvaluation,
  type AchievementEvaluationReason,
  type AchievementProgress,
  type CareerAchievementSnapshot,
  type SingleMatchAchievementSnapshot,
} from "./AchievementContracts";
import type { PieceType } from "../../types/Chess";

const PIECE_TYPES: readonly PieceType[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];

interface MetricResult {
  readonly value?: number;
  readonly reason?: "missing-data" | "invalid-data";
}

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function metric(value: unknown): MetricResult {
  if (value === undefined) return { reason: "missing-data" };
  return isCounter(value) ? { value } : { reason: "invalid-data" };
}

function pieceCounters(
  value: Partial<Readonly<Record<PieceType, number>>> | undefined,
): MetricResult & { readonly counters?: readonly number[] } {
  if (!value) return { reason: "missing-data" };
  const counters = PIECE_TYPES.map((piece) => value[piece]);
  if (counters.some((counter) => counter === undefined)) return { reason: "missing-data" };
  if (!counters.every(isCounter)) return { reason: "invalid-data" };
  return { counters: counters as number[] };
}

function progress(
  definition: AchievementDefinition,
  current: number,
  completed: boolean,
): AchievementProgress {
  const percentage = definition.target === 0
    ? (completed ? 100 : 0)
    : Math.min(100, Math.max(0, (current / definition.target) * 100));
  return {
    achievementId: definition.id,
    current,
    target: definition.target,
    completed,
    displayProgress: definition.visibility === "public",
    normalizedPercent: percentage,
  };
}

function result(
  definition: AchievementDefinition,
  current: number,
  eligible: boolean,
  reason?: AchievementEvaluationReason,
): AchievementEvaluation {
  return {
    achievementId: definition.id,
    eligible,
    progress: progress(definition, current, eligible),
    dataMissing: reason === "missing-data" || reason === "invalid-data",
    ...(reason ? { reason } : {}),
  };
}

function unavailable(definition: AchievementDefinition, reason: AchievementEvaluationReason): AchievementEvaluation {
  return result(definition, 0, false, reason);
}

function careerMetric(definition: AchievementDefinition, snapshot: CareerAchievementSnapshot): MetricResult {
  switch (definition.metric) {
    case "singleplayer-games": return metric(snapshot.singleplayer?.completedGames);
    case "singleplayer-kings-captured": return metric(snapshot.singleplayer?.kingsCaptured);
    case "singleplayer-best-win-streak": return metric(snapshot.singleplayer?.bestWinStreak);
    case "singleplayer-level": return metric(snapshot.singleplayer?.level);
    case "ranked-wins": return metric(snapshot.ranked?.wins);
    case "ranked-games": return metric(snapshot.ranked?.completedGames);
    case "ranked-best-win-streak": return metric(snapshot.ranked?.bestWinStreak);
    case "ranked-rating": return metric(snapshot.ranked?.currentRating);
    case "global-roulette-rolls": return metric(snapshot.global?.rouletteRolls);
    case "global-three-rights-turns": return metric(snapshot.global?.threeRightsTurns);
    case "global-pawn-moves": return metric(snapshot.global?.movesByPiece?.pawn);
    case "global-knight-moves": return metric(snapshot.global?.movesByPiece?.knight);
    case "global-king-moves": return metric(snapshot.global?.movesByPiece?.king);
    case "global-triple-piece-types": {
      const counters = pieceCounters(snapshot.global?.tripleRollsByPiece);
      return counters.counters
        ? { value: counters.counters.filter((value) => value >= 1).length }
        : { reason: counters.reason };
    }
    case "global-triple-rolls": {
      const counters = pieceCounters(snapshot.global?.tripleRollsByPiece);
      return counters.counters
        ? { value: counters.counters.reduce((sum, value) => sum + value, 0) }
        : { reason: counters.reason };
    }
    default: return { reason: "missing-data" };
  }
}

export function evaluateCareerAchievement(
  definition: AchievementDefinition,
  snapshot: CareerAchievementSnapshot,
): AchievementEvaluation {
  if (definition.category === "single-match") return unavailable(definition, "scope-mismatch");
  const resolved = careerMetric(definition, snapshot);
  if (resolved.value === undefined) return unavailable(definition, resolved.reason ?? "missing-data");
  const eligible = resolved.value >= definition.target;
  return result(definition, resolved.value, eligible, eligible ? undefined : "condition-not-met");
}

export function evaluateCareerAchievements(
  snapshot: CareerAchievementSnapshot,
): readonly AchievementEvaluation[] {
  return ACHIEVEMENT_CATALOG
    .filter((definition) => definition.category !== "single-match")
    .map((definition) => evaluateCareerAchievement(definition, snapshot));
}

function isCompletedSingleplayerMatch(snapshot: SingleMatchAchievementSnapshot): boolean {
  return snapshot.mode === "singleplayer" && snapshot.status === "completed"
    && snapshot.complete
    && (snapshot.terminationReason === "king-captured" || snapshot.terminationReason === "timeout");
}

function isKingCaptureWin(snapshot: SingleMatchAchievementSnapshot): boolean {
  return snapshot.terminationReason === "king-captured" && snapshot.winner === snapshot.playerColor;
}

function singleMatchMetric(
  definition: AchievementDefinition,
  snapshot: SingleMatchAchievementSnapshot,
): MetricResult {
  switch (definition.metric) {
    case "match-total-moves": {
      const player = metric(snapshot.playerSuccessfulMoves);
      const bot = metric(snapshot.botSuccessfulMoves);
      const total = metric(snapshot.totalSuccessfulMoves);
      if (player.value === undefined) return player;
      if (bot.value === undefined) return bot;
      if (total.value === undefined) return total;
      return total.value === player.value + bot.value ? total : { reason: "invalid-data" };
    }
    case "match-distinct-promotions": {
      if (!snapshot.promotedPawnIds) return { reason: "missing-data" };
      if (snapshot.promotedPawnIds.some((id) => !id.trim())) return { reason: "invalid-data" };
      return { value: new Set(snapshot.promotedPawnIds).size };
    }
    case "match-enemy-captures": return metric(snapshot.capturedEnemyPieces);
    case "match-triple-rolls": return metric(snapshot.tripleRouletteResults);
    case "match-final-own-pieces": return metric(snapshot.finalOwnPieceCount);
    case "match-own-pieces-captured": return metric(snapshot.capturedOwnPieces);
    case "match-pawn-captures": return metric(snapshot.pawnCaptures);
    case "match-consecutive-three-rights-turns": {
      const current = metric(snapshot.currentConsecutiveThreeRightsTurns);
      const best = metric(snapshot.bestConsecutiveThreeRightsTurns);
      const terminalMoves = metric(snapshot.terminalPlayerTurnMovesUsed);
      if (current.value === undefined) return current;
      if (best.value === undefined) return best;
      if (terminalMoves.value === undefined) return terminalMoves;
      if (terminalMoves.value > 3 || best.value < current.value) return { reason: "invalid-data" };
      return { value: Math.max(best.value, current.value + (terminalMoves.value === 3 ? 1 : 0)) };
    }
    default: return { reason: "missing-data" };
  }
}

export function evaluateSingleMatchAchievement(
  definition: AchievementDefinition,
  snapshot: SingleMatchAchievementSnapshot,
): AchievementEvaluation {
  if (definition.category !== "single-match" || snapshot.mode !== "singleplayer") {
    return unavailable(definition, "scope-mismatch");
  }
  if (!isCompletedSingleplayerMatch(snapshot)) {
    return unavailable(definition, "match-not-completed");
  }
  if (!snapshot.valid || !snapshot.matchId.trim()) {
    return unavailable(definition, "invalid-data");
  }
  const resolved = singleMatchMetric(definition, snapshot);
  if (resolved.value === undefined) return unavailable(definition, resolved.reason ?? "missing-data");

  const needsKingCaptureWin = definition.id === "last_one_standing"
    || definition.id === "against_all_odds" || definition.id === "untouchable";
  const thresholdMet = definition.id === "against_all_odds"
    ? resolved.value <= definition.target
    : definition.id === "untouchable"
      ? resolved.value === 0
      : resolved.value >= definition.target;
  const eligible = thresholdMet && (!needsKingCaptureWin || isKingCaptureWin(snapshot));
  return result(definition, resolved.value, eligible, eligible ? undefined : "condition-not-met");
}

export function evaluateSingleMatchAchievements(
  snapshot: SingleMatchAchievementSnapshot,
): readonly AchievementEvaluation[] {
  return ACHIEVEMENT_CATALOG
    .filter((definition) => definition.category === "single-match")
    .map((definition) => evaluateSingleMatchAchievement(definition, snapshot));
}
