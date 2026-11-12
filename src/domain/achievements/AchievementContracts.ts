import type { PlayerId } from "../contracts/PlayerIdentity";
import type { PieceColor, PieceType } from "../../types/Chess";

export const ACHIEVEMENT_CATALOG_VERSION = 1 as const;

export type AchievementId =
  | "rookie_campaign" | "hundred_games" | "dedicated_player"
  | "king_hunter" | "capture_hundred_kings" | "winning_run"
  | "ranked_victor" | "ranked_regular" | "ranked_veteran"
  | "winning_streak" | "rating_climber" | "elite_player"
  | "wheel_spinner" | "roulette_master" | "roll_collector"
  | "triple_crown" | "triple_collector" | "full_rights"
  | "pawn_commander" | "knight_specialist" | "royal_maneuvers"
  | "roulette_legend" | "the_long_march" | "royal_ascension"
  | "last_one_standing" | "wheels_favor" | "against_all_odds"
  | "untouchable" | "pawn_rebellion" | "perfect_rhythm";

export type AchievementCategory =
  | "singleplayer-career"
  | "ranked-multiplayer"
  | "global-roulette"
  | "global-piece-mastery"
  | "singleplayer-progression"
  | "single-match";

export type AchievementFilter =
  | "all" | "singleplayer" | "ranked" | "roulette"
  | "piece-mastery" | "progression" | "single-match";

export type AchievementScope =
  | "singleplayer-career"
  | "ranked-multiplayer"
  | "global-career"
  | "singleplayer-match";

export type AchievementMetric =
  | "singleplayer-games" | "singleplayer-kings-captured" | "singleplayer-best-win-streak"
  | "ranked-wins" | "ranked-games" | "ranked-best-win-streak" | "ranked-rating"
  | "global-roulette-rolls" | "global-triple-piece-types" | "global-triple-rolls"
  | "global-three-rights-turns" | "global-pawn-moves" | "global-knight-moves"
  | "global-king-moves" | "singleplayer-level"
  | "match-total-moves" | "match-distinct-promotions" | "match-enemy-captures"
  | "match-triple-rolls" | "match-final-own-pieces" | "match-own-pieces-captured"
  | "match-pawn-captures" | "match-consecutive-three-rights-turns";

export type AchievementUnit =
  | "games" | "captures" | "streak" | "rating" | "rolls"
  | "piece-types" | "turns" | "moves" | "level" | "promotions" | "pieces";

export interface LocalizedAchievementText {
  readonly en: string;
  readonly tr: string;
}

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly category: AchievementCategory;
  readonly scope: AchievementScope;
  readonly metric: AchievementMetric;
  readonly target: number;
  readonly unit: AchievementUnit;
  readonly visibility: "public" | "partially-hidden";
  readonly title: LocalizedAchievementText;
  readonly description: LocalizedAchievementText;
  readonly hint?: LocalizedAchievementText;
  readonly reward: "badge";
  readonly catalogVersion: typeof ACHIEVEMENT_CATALOG_VERSION;
  readonly order: number;
}

export interface AchievementProgress {
  readonly achievementId: AchievementId;
  readonly current: number;
  readonly target: number;
  readonly completed: boolean;
  readonly displayProgress: boolean;
  readonly normalizedPercent: number;
}

export type AchievementEvaluationReason =
  | "missing-data"
  | "invalid-data"
  | "scope-mismatch"
  | "match-not-completed"
  | "condition-not-met";

export interface AchievementEvaluation {
  readonly achievementId: AchievementId;
  readonly eligible: boolean;
  readonly progress: AchievementProgress;
  readonly dataMissing: boolean;
  readonly reason?: AchievementEvaluationReason;
}

export interface AchievementUnlock {
  readonly achievementId: AchievementId;
  readonly playerId: PlayerId;
  readonly unlockedAt: string;
  readonly sourceType: "career-snapshot" | "single-match";
  readonly sourceId: string;
  readonly catalogVersion: number;
}

export interface CareerAchievementSnapshot {
  readonly singleplayer?: {
    readonly completedGames?: number;
    readonly kingsCaptured?: number;
    readonly bestWinStreak?: number;
    readonly level?: number;
  };
  readonly ranked?: {
    readonly completedGames?: number;
    readonly wins?: number;
    readonly bestWinStreak?: number;
    readonly currentRating?: number;
  };
  readonly global?: {
    readonly rouletteRolls?: number;
    readonly threeRightsTurns?: number;
    readonly movesByPiece?: Partial<Readonly<Record<PieceType, number>>>;
    readonly tripleRollsByPiece?: Partial<Readonly<Record<PieceType, number>>>;
  };
}

export type AchievementMatchMode =
  | "singleplayer"
  | "ranked-multiplayer"
  | "unranked-multiplayer";

export type AchievementMatchStatus =
  | "active"
  | "completed"
  | "abandoned"
  | "technical-abort";

export type AchievementMatchTerminationReason =
  | "king-captured"
  | "timeout"
  | "abandoned"
  | "technical-abort"
  | null;

/** Future MatchAchievementTracker output. Optional counters preserve missing-data semantics. */
export interface SingleMatchAchievementSnapshot {
  readonly matchId: string;
  readonly mode: AchievementMatchMode;
  readonly playerId: PlayerId;
  readonly playerColor: PieceColor;
  readonly status: AchievementMatchStatus;
  readonly terminationReason: AchievementMatchTerminationReason;
  readonly winner: PieceColor | null;
  readonly valid: boolean;
  readonly playerSuccessfulMoves?: number;
  readonly botSuccessfulMoves?: number;
  readonly totalSuccessfulMoves?: number;
  readonly promotedPawnIds?: readonly string[];
  readonly capturedEnemyPieces?: number;
  readonly capturedOwnPieces?: number;
  readonly pawnCaptures?: number;
  readonly tripleRouletteResults?: number;
  readonly currentConsecutiveThreeRightsTurns?: number;
  readonly bestConsecutiveThreeRightsTurns?: number;
  /** Zero to three moves in a terminal player turn not followed by onTurnCompleted. */
  readonly terminalPlayerTurnMovesUsed?: number;
  readonly finalOwnPieceCount?: number;
  readonly complete: boolean;
}

export interface AchievementPresentation {
  readonly id: AchievementId;
  readonly title: LocalizedAchievementText;
  readonly description?: LocalizedAchievementText;
  readonly hint?: LocalizedAchievementText;
  readonly target?: number;
  readonly locked: boolean;
  readonly displayProgress: boolean;
}

export interface NewlyUnlockedAchievements {
  readonly achievementIds: readonly AchievementId[];
}
