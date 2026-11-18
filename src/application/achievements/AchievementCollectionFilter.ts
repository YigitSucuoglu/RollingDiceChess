import { ACHIEVEMENT_CATALOG } from "../../domain/achievements/AchievementCatalog";
import type { AchievementDefinition } from "../../domain/achievements/AchievementContracts";

export type CollectionFilter = "all" | "singleplayer" | "ranked" | "roulette" | "pieceMastery" | "challenges";
export const COLLECTION_FILTERS: readonly CollectionFilter[] = [
  "all", "singleplayer", "ranked", "roulette", "pieceMastery", "challenges",
];

export function collectionItems(filter: CollectionFilter): readonly AchievementDefinition[] {
  if (filter === "all") return ACHIEVEMENT_CATALOG;
  return ACHIEVEMENT_CATALOG.filter((achievement) => {
    switch (filter) {
      case "singleplayer": return achievement.category === "singleplayer-career" || achievement.category === "singleplayer-progression";
      case "ranked": return achievement.category === "ranked-multiplayer";
      case "roulette": return achievement.category === "global-roulette";
      case "pieceMastery": return achievement.category === "global-piece-mastery";
      case "challenges": return achievement.category === "single-match";
    }
  });
}
