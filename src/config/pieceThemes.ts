import { SLOT_MACHINE_ASSETS } from "../assets/slot-machine";
import blackBishopUrl from "../assets/pieces/classic/black-bishop.svg";
import blackKingUrl from "../assets/pieces/classic/black-king.svg";
import blackKnightUrl from "../assets/pieces/classic/black-knight.svg";
import blackPawnUrl from "../assets/pieces/classic/black-pawn.svg";
import blackQueenUrl from "../assets/pieces/classic/black-queen.svg";
import blackRookUrl from "../assets/pieces/classic/black-rook.svg";
import whiteBishopUrl from "../assets/pieces/classic/white-bishop.svg";
import whiteKingUrl from "../assets/pieces/classic/white-king.svg";
import whiteKnightUrl from "../assets/pieces/classic/white-knight.svg";
import whitePawnUrl from "../assets/pieces/classic/white-pawn.svg";
import whiteQueenUrl from "../assets/pieces/classic/white-queen.svg";
import whiteRookUrl from "../assets/pieces/classic/white-rook.svg";
import type { PieceColor, PieceType } from "../types/Chess";
import type { PieceTheme } from "../types/PieceTheme";

export type PieceVisualContext = "board" | "slot";

export interface TextPieceVisual {
  readonly kind: "text";
  readonly label: string;
  readonly value: string;
}

export interface ImagePieceVisual {
  readonly fallback: string;
  readonly kind: "image";
  readonly label: string;
  readonly src: string;
}

export type PieceVisual = TextPieceVisual | ImagePieceVisual;

export interface PieceThemeDefinition {
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

const PIECE_FALLBACK_LABELS: Readonly<Record<PieceType, string>> = {
  bishop: "B",
  king: "K",
  knight: "N",
  pawn: "P",
  queen: "Q",
  rook: "R",
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
    kind: "image",
    label: PIECE_LABELS.bishop,
    src: SLOT_MACHINE_ASSETS.symbols.bishop,
  },
  king: {
    fallback: GOLD_BOARD_SYMBOLS.black.king,
    kind: "image",
    label: PIECE_LABELS.king,
    src: SLOT_MACHINE_ASSETS.symbols.king,
  },
  knight: {
    fallback: GOLD_BOARD_SYMBOLS.black.knight,
    kind: "image",
    label: PIECE_LABELS.knight,
    src: SLOT_MACHINE_ASSETS.symbols.knight,
  },
  pawn: {
    fallback: GOLD_BOARD_SYMBOLS.black.pawn,
    kind: "image",
    label: PIECE_LABELS.pawn,
    src: SLOT_MACHINE_ASSETS.symbols.pawn,
  },
  queen: {
    fallback: GOLD_BOARD_SYMBOLS.black.queen,
    kind: "image",
    label: PIECE_LABELS.queen,
    src: SLOT_MACHINE_ASSETS.symbols.queen,
  },
  rook: {
    fallback: GOLD_BOARD_SYMBOLS.black.rook,
    kind: "image",
    label: PIECE_LABELS.rook,
    src: SLOT_MACHINE_ASSETS.symbols.rook,
  },
};

const CLASSIC_PIECE_ASSETS: Readonly<
  Record<PieceColor, Readonly<Record<PieceType, string>>>
> = {
  white: {
    bishop: whiteBishopUrl,
    king: whiteKingUrl,
    knight: whiteKnightUrl,
    pawn: whitePawnUrl,
    queen: whiteQueenUrl,
    rook: whiteRookUrl,
  },
  black: {
    bishop: blackBishopUrl,
    king: blackKingUrl,
    knight: blackKnightUrl,
    pawn: blackPawnUrl,
    queen: blackQueenUrl,
    rook: blackRookUrl,
  },
};

export const PIECE_THEME_CATALOG: Readonly<
  Record<PieceTheme, PieceThemeDefinition>
> = {
  gold: {
    id: "gold",
    isSelectable: true,
    label: "Gold",
  },
  classic: {
    id: "classic",
    isSelectable: true,
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

export function resolvePieceVisual({
  context,
  pieceColor,
  pieceType,
  theme,
}: ResolvePieceVisualOptions): PieceVisual {
  const visualTheme = normalizePieceTheme(theme);

  if (visualTheme === "gold" && context === "slot") {
    return GOLD_SLOT_VISUALS[pieceType];
  }

  if (visualTheme === "classic") {
    return {
      fallback: PIECE_FALLBACK_LABELS[pieceType],
      kind: "image",
      label: PIECE_LABELS[pieceType],
      src: CLASSIC_PIECE_ASSETS[pieceColor][pieceType],
    };
  }

  return {
    kind: "text",
    label: PIECE_LABELS[pieceType],
    value: GOLD_BOARD_SYMBOLS[pieceColor][pieceType],
  };
}
