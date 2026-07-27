import type { PieceColor } from "./Chess";
import type { BoardTheme } from "./BoardTheme";
import type { PieceSet } from "./PieceSet";

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
  readonly pieceSet: PieceSet;
  readonly boardTheme: BoardTheme;
  readonly botDifficulty: BotDifficulty;
}

export type GameSetupInput = Omit<
  GameSetup,
  "boardTheme" | "botDifficulty" | "pieceSet"
> & {
  readonly boardTheme?: unknown;
  readonly botDifficulty?: BotDifficulty;
  readonly pieceSet?: unknown;
  /** Legacy serialized field. Normalized to pieceSet at the setup boundary. */
  readonly pieceTheme?: unknown;
};
