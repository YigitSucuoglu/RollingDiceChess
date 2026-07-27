import classicBlackBishopUrl from "../assets/pieces/classic/black-bishop.svg";
import classicBlackKingUrl from "../assets/pieces/classic/black-king.svg";
import classicBlackKnightUrl from "../assets/pieces/classic/black-knight.svg";
import classicBlackPawnUrl from "../assets/pieces/classic/black-pawn.svg";
import classicBlackQueenUrl from "../assets/pieces/classic/black-queen.svg";
import classicBlackRookUrl from "../assets/pieces/classic/black-rook.svg";
import classicWhiteBishopUrl from "../assets/pieces/classic/white-bishop.svg";
import classicWhiteKingUrl from "../assets/pieces/classic/white-king.svg";
import classicWhiteKnightUrl from "../assets/pieces/classic/white-knight.svg";
import classicWhitePawnUrl from "../assets/pieces/classic/white-pawn.svg";
import classicWhiteQueenUrl from "../assets/pieces/classic/white-queen.svg";
import classicWhiteRookUrl from "../assets/pieces/classic/white-rook.svg";
import blackBishopUrl from "../assets/pieces/retro/black-bishop.svg";
import blackKingUrl from "../assets/pieces/retro/black-king.svg";
import blackKnightUrl from "../assets/pieces/retro/black-knight.svg";
import blackPawnUrl from "../assets/pieces/retro/black-pawn.svg";
import blackQueenUrl from "../assets/pieces/retro/black-queen.svg";
import blackRookUrl from "../assets/pieces/retro/black-rook.svg";
import whiteBishopUrl from "../assets/pieces/retro/white-bishop.svg";
import whiteKingUrl from "../assets/pieces/retro/white-king.svg";
import whiteKnightUrl from "../assets/pieces/retro/white-knight.svg";
import whitePawnUrl from "../assets/pieces/retro/white-pawn.svg";
import whiteQueenUrl from "../assets/pieces/retro/white-queen.svg";
import whiteRookUrl from "../assets/pieces/retro/white-rook.svg";
import type { PieceColor, PieceType } from "../types/Chess";
import type { PieceSet } from "../types/PieceSet";

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

export interface PieceSetDefinition {
  readonly id: PieceSet;
  readonly label: string;
}

interface ResolvePieceVisualOptions {
  readonly context: PieceVisualContext;
  readonly pieceColor: PieceColor;
  readonly pieceType: PieceType;
  readonly pieceSet: unknown;
}

export const DEFAULT_PIECE_SET: PieceSet = "classic";

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

const CLASSIC_PIECE_ASSETS: Readonly<
  Record<PieceColor, Readonly<Record<PieceType, string>>>
> = {
  white: {
    bishop: classicWhiteBishopUrl,
    king: classicWhiteKingUrl,
    knight: classicWhiteKnightUrl,
    pawn: classicWhitePawnUrl,
    queen: classicWhiteQueenUrl,
    rook: classicWhiteRookUrl,
  },
  black: {
    bishop: classicBlackBishopUrl,
    king: classicBlackKingUrl,
    knight: classicBlackKnightUrl,
    pawn: classicBlackPawnUrl,
    queen: classicBlackQueenUrl,
    rook: classicBlackRookUrl,
  },
};

const RETRO_PIECE_ASSETS: Readonly<
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

export const PIECE_SET_CATALOG: Readonly<
  Record<PieceSet, PieceSetDefinition>
> = {
  classic: {
    id: "classic",
    label: "Classic",
  },
  retro: {
    id: "retro",
    label: "Retro",
  },
};

export const SELECTABLE_PIECE_SETS: readonly PieceSetDefinition[] = [
  PIECE_SET_CATALOG.classic,
  PIECE_SET_CATALOG.retro,
];

export function isPieceSet(value: unknown): value is PieceSet {
  return value === "classic" || value === "retro";
}

export function normalizePieceSet(value: unknown): PieceSet {
  return isPieceSet(value) ? value : DEFAULT_PIECE_SET;
}

export function migrateLegacyPieceSet(value: unknown): PieceSet {
  if (value === "classic") {
    return "retro";
  }

  if (value === "gold") {
    return "classic";
  }

  return DEFAULT_PIECE_SET;
}

export function resolvePieceVisual({
  pieceColor,
  pieceType,
  pieceSet,
}: ResolvePieceVisualOptions): PieceVisual {
  const visualSet = normalizePieceSet(pieceSet);
  const assets =
    visualSet === "classic" ? CLASSIC_PIECE_ASSETS : RETRO_PIECE_ASSETS;

  return {
    fallback: PIECE_FALLBACK_LABELS[pieceType],
    kind: "image",
    label: PIECE_LABELS[pieceType],
    src: assets[pieceColor][pieceType],
  };
}
