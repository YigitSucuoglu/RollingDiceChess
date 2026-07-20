import type { PieceColor } from "./Chess";

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
  readonly pieceTheme: "gold";
  readonly boardTheme: "default";
}
