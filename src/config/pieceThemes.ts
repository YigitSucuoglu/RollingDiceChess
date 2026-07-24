import { SLOT_MACHINE_ASSETS } from "../assets/slot-machine";
import type { PieceColor, PieceType } from "../types/Chess";
import type { PieceTheme } from "../types/PieceTheme";

export type PieceVisualContext = "board" | "slot";

export interface PieceVisual {
  readonly fallback: string;
  readonly label: string;
  readonly src: string | null;
}

export interface PieceThemeDefinition {
  readonly fallbackTheme: PieceTheme | null;
  readonly id: PieceTheme;
  readonly isSelectable: boolean;
  readonly label: string;
}

interface ResolvePieceVisualOptions {
  readonly context: PieceVisualContext;
  readonly pieceColor: PieceColor;
  readonly pieceType: PieceType;
  readonly theme: unknown;
}

export const DEFAULT_PIECE_THEME: PieceTheme = "gold";

const PIECE_LABELS: Readonly<Record<PieceType, string>> = {
  bishop: "Bishop",
  king: "King",
  knight: "Knight",
  pawn: "Pawn",
  queen: "Queen",
  rook: "Rook",
};

const GOLD_BOARD_SYMBOLS: Readonly<
  Record<PieceColor, Readonly<Record<PieceType, string>>>
> = {
  white: {
    bishop: "\u2657",
    king: "\u2654",
    knight: "\u2658",
    pawn: "\u2659",
    queen: "\u2655",
    rook: "\u2656",
  },
  black: {
    bishop: "\u265d",
    king: "\u265a",
    knight: "\u265e",
    pawn: "\u265f",
    queen: "\u265b",
    rook: "\u265c",
  },
};

const GOLD_SLOT_VISUALS: Readonly<Record<PieceType, PieceVisual>> = {
  bishop: {
    fallback: GOLD_BOARD_SYMBOLS.black.bishop,
    label: PIECE_LABELS.bishop,
    src: SLOT_MACHINE_ASSETS.symbols.bishop,
  },
  king: {
    fallback: GOLD_BOARD_SYMBOLS.black.king,
    label: PIECE_LABELS.king,
    src: SLOT_MACHINE_ASSETS.symbols.king,
  },
  knight: {
    fallback: GOLD_BOARD_SYMBOLS.black.knight,
    label: PIECE_LABELS.knight,
    src: SLOT_MACHINE_ASSETS.symbols.knight,
  },
  pawn: {
    fallback: GOLD_BOARD_SYMBOLS.black.pawn,
    label: PIECE_LABELS.pawn,
    src: SLOT_MACHINE_ASSETS.symbols.pawn,
  },
  queen: {
    fallback: GOLD_BOARD_SYMBOLS.black.queen,
    label: PIECE_LABELS.queen,
    src: SLOT_MACHINE_ASSETS.symbols.queen,
  },
  rook: {
    fallback: GOLD_BOARD_SYMBOLS.black.rook,
    label: PIECE_LABELS.rook,
    src: SLOT_MACHINE_ASSETS.symbols.rook,
  },
};

export const PIECE_THEME_CATALOG: Readonly<
  Record<PieceTheme, PieceThemeDefinition>
> = {
  gold: {
    fallbackTheme: null,
    id: "gold",
    isSelectable: true,
    label: "Gold",
  },
  classic: {
    fallbackTheme: "gold",
    id: "classic",
    isSelectable: false,
    label: "Classic",
  },
};

export const PIECE_THEME_OPTIONS: readonly PieceThemeDefinition[] = [
  PIECE_THEME_CATALOG.gold,
  PIECE_THEME_CATALOG.classic,
];

export const SELECTABLE_PIECE_THEMES: readonly PieceThemeDefinition[] =
  PIECE_THEME_OPTIONS.filter((theme) => theme.isSelectable);

export function isPieceTheme(value: unknown): value is PieceTheme {
  return value === "gold" || value === "classic";
}

export function normalizePieceTheme(value: unknown): PieceTheme {
  return isPieceTheme(value) ? value : DEFAULT_PIECE_THEME;
}

function getVisualTheme(theme: unknown): PieceTheme {
  const normalizedTheme = normalizePieceTheme(theme);
  const definition = PIECE_THEME_CATALOG[normalizedTheme];

  return definition.isSelectable
    ? normalizedTheme
    : (definition.fallbackTheme ?? DEFAULT_PIECE_THEME);
}

export function resolvePieceVisual({
  context,
  pieceColor,
  pieceType,
  theme,
}: ResolvePieceVisualOptions): PieceVisual {
  const visualTheme = getVisualTheme(theme);

  if (visualTheme === "gold" && context === "slot") {
    return GOLD_SLOT_VISUALS[pieceType];
  }

  return {
    fallback: GOLD_BOARD_SYMBOLS[pieceColor][pieceType],
    label: PIECE_LABELS[pieceType],
    src: null,
  };
}
