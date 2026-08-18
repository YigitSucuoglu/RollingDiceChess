export type MatchExitMode =
  | "singleplayer-bot"
  | "multiplayer-unranked"
  | "multiplayer-ranked";

export interface MatchExitPolicy {
  readonly awardsXp: false;
  readonly countsAsLoss: boolean;
  readonly affectsRating: boolean;
  readonly descriptionKey: string;
  readonly outcome: "abandoned" | "forfeit";
  readonly titleKey: string;
}

const POLICIES: Readonly<Record<MatchExitMode, MatchExitPolicy>> = {
  "singleplayer-bot": {
    awardsXp: false,
    countsAsLoss: false,
    affectsRating: false,
    descriptionKey: "game.exit.botDescription",
    outcome: "abandoned",
    titleKey: "game.exit.title",
  },
  "multiplayer-unranked": {
    awardsXp: false,
    countsAsLoss: false,
    affectsRating: false,
    descriptionKey: "game.exit.unrankedDescription",
    outcome: "forfeit",
    titleKey: "game.exit.title",
  },
  "multiplayer-ranked": {
    awardsXp: false,
    countsAsLoss: true,
    affectsRating: true,
    descriptionKey: "game.exit.rankedDescription",
    outcome: "forfeit",
    titleKey: "game.exit.rankedTitle",
  },
};

export function resolveMatchExitPolicy(mode: MatchExitMode): MatchExitPolicy {
  return POLICIES[mode];
}
