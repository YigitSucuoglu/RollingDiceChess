import type { CSSProperties } from "react";
import type { BoardTheme } from "../types/BoardTheme";

export type BoardThemeStyle = CSSProperties & {
  readonly "--board-background": string;
  readonly "--board-coordinate-dark": string;
  readonly "--board-coordinate-light": string;
  readonly "--board-dark-square": string;
  readonly "--board-frame": string;
  readonly "--board-frame-border": string;
  readonly "--board-light-square": string;
  readonly "--board-move-dot": string;
  readonly "--board-selected": string;
  readonly "--board-shadow": string;
};

export interface BoardThemeDefinition {
  readonly id: BoardTheme;
  readonly label: string;
  readonly style: BoardThemeStyle;
}

export const DEFAULT_BOARD_THEME: BoardTheme = "wood";

export const BOARD_THEME_CATALOG: Readonly<
  Record<BoardTheme, BoardThemeDefinition>
> = {
  wood: {
    id: "wood",
    label: "Wood",
    style: {
      "--board-background": "#6f4c2f",
      "--board-coordinate-dark": "rgba(255,235,195,.82)",
      "--board-coordinate-light": "rgba(83,53,24,.82)",
      "--board-dark-square":
        "linear-gradient(135deg,rgba(108,65,34,.09),transparent 58%),#b58863",
      "--board-frame":
        "linear-gradient(135deg,#4a321f 0%,#2f2117 52%,#4b3320 100%)",
      "--board-frame-border": "#3b2a1a",
      "--board-light-square":
        "linear-gradient(135deg,rgba(255,255,255,.08),transparent 58%),#f0d9b5",
      "--board-move-dot": "rgba(40,40,40,.48)",
      "--board-selected": "#ffd54f",
      "--board-shadow": "0 0 30px rgba(0,0,0,.5)",
    },
  },
  marble: {
    id: "marble",
    label: "Marble",
    style: {
      "--board-background": "#a7a29a",
      "--board-coordinate-dark": "rgba(245,242,232,.9)",
      "--board-coordinate-light": "rgba(55,59,63,.82)",
      "--board-dark-square":
        "linear-gradient(145deg,rgba(255,255,255,.12),transparent 38%),linear-gradient(35deg,transparent 48%,rgba(48,53,57,.12) 50%,transparent 53%),#7b8386",
      "--board-frame":
        "linear-gradient(145deg,#dedbd2 0%,#9a9892 45%,#c9c6bd 100%)",
      "--board-frame-border": "#77746e",
      "--board-light-square":
        "linear-gradient(145deg,rgba(255,255,255,.44),transparent 42%),linear-gradient(35deg,transparent 48%,rgba(102,105,105,.1) 50%,transparent 53%),#d8d5ca",
      "--board-move-dot": "rgba(24,39,45,.54)",
      "--board-selected": "#f0b429",
      "--board-shadow": "0 0 30px rgba(0,0,0,.42)",
    },
  },
  dark: {
    id: "dark",
    label: "Dark",
    style: {
      "--board-background": "#171b20",
      "--board-coordinate-dark": "rgba(232,239,242,.88)",
      "--board-coordinate-light": "rgba(35,42,47,.82)",
      "--board-dark-square":
        "linear-gradient(135deg,rgba(255,255,255,.025),transparent 60%),#35414a",
      "--board-frame":
        "linear-gradient(145deg,#303940 0%,#151a1e 55%,#252d33 100%)",
      "--board-frame-border": "#11161a",
      "--board-light-square":
        "linear-gradient(135deg,rgba(255,255,255,.06),transparent 60%),#9aa6a8",
      "--board-move-dot": "rgba(255,214,79,.62)",
      "--board-selected": "#ffd54f",
      "--board-shadow": "0 0 30px rgba(0,0,0,.62)",
    },
  },
};

export const SELECTABLE_BOARD_THEMES: readonly BoardThemeDefinition[] = [
  BOARD_THEME_CATALOG.wood,
  BOARD_THEME_CATALOG.marble,
  BOARD_THEME_CATALOG.dark,
];

export function isBoardTheme(value: unknown): value is BoardTheme {
  return value === "wood" || value === "marble" || value === "dark";
}

export function normalizeBoardTheme(value: unknown): BoardTheme {
  return isBoardTheme(value) ? value : DEFAULT_BOARD_THEME;
}
