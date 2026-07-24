import type { PieceColor } from "./Chess";
import type { PieceTheme } from "./PieceTheme";

export type BotDifficulty = "easy" | "medium" | "hard";

export type TimeControlCategory =
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical";

export interface TimeControlOption {
  readonly id: string;
  readonly label: string;
  readonly category: TimeControlCategory;
  readonly initialMinutes: number;
  readonly incrementSeconds: number;
}

export interface GameSetup {
  readonly timeControl: TimeControlOption;
  readonly playerColor: PieceColor;
  readonly botColor: PieceColor;
  readonly opponentType: "bot";
  readonly pieceTheme: PieceTheme;
  readonly boardTheme: "default";
  readonly botDifficulty: BotDifficulty;
}

export type GameSetupInput = Omit<
  GameSetup,
  "botDifficulty" | "pieceTheme"
> & {
  readonly botDifficulty?: BotDifficulty;
  readonly pieceTheme?: unknown;
};
