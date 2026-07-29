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
import goldBlackBishopUrl from "../assets/pieces/gold/black-bishop.png";
import goldBlackKingUrl from "../assets/pieces/gold/black-king.png";
import goldBlackKnightUrl from "../assets/pieces/gold/black-knight.png";
import goldBlackPawnUrl from "../assets/pieces/gold/black-pawn.png";
import goldBlackQueenUrl from "../assets/pieces/gold/black-queen.png";
import goldBlackRookUrl from "../assets/pieces/gold/black-rook.png";
import goldWhiteBishopUrl from "../assets/pieces/gold/white-bishop.png";
import goldWhiteKingUrl from "../assets/pieces/gold/white-king.png";
import goldWhiteKnightUrl from "../assets/pieces/gold/white-knight.png";
import goldWhitePawnUrl from "../assets/pieces/gold/white-pawn.png";
import goldWhiteQueenUrl from "../assets/pieces/gold/white-queen.png";
import goldWhiteRookUrl from "../assets/pieces/gold/white-rook.png";
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

export type PieceVisualContext = "board" | "result" | "roulette";

export interface TextPieceVisual {
  readonly kind: "text";
  readonly label: string;
  readonly value: string;
}

export interface ImagePieceVisual {
  readonly fallback: string;
  readonly kind: "image";
  readonly label: string;
  readonly scale: number;
  readonly src: string;
  readonly translateX: number;
  readonly translateY: number;
}

export type PieceVisual = TextPieceVisual | ImagePieceVisual;

export interface PieceSetDefinition {
  readonly boardAssets: PieceAssetMap;
  readonly boardScale: PieceScaleMap;
  readonly boardTranslateY: PieceScaleMap;
  readonly displayName: string;
  readonly id: PieceSet;
  readonly resultAssets: PieceAssetMap;
  readonly resultScale: PieceScaleMap;
  readonly resultTranslateY: PieceScaleMap;
  readonly rouletteAssets: PieceAssetMap;
  readonly rouletteScale: PieceScaleMap;
  readonly rouletteTranslateY: PieceScaleMap;
  readonly translateX: PieceScaleMap;
}

interface ResolvePieceVisualOptions {
  readonly context: PieceVisualContext;
  readonly pieceColor: PieceColor;
  readonly pieceType: PieceType;
  readonly pieceSet: unknown;
}

type PieceAssetMap = Readonly<
  Record<PieceColor, Readonly<Record<PieceType, string>>>
>;

type PieceScaleMap = Readonly<Record<PieceType, number>>;

export const DEFAULT_PIECE_SET: PieceSet = "gold";

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

const GOLD_PIECE_ASSETS: PieceAssetMap = {
  white: {
    bishop: goldWhiteBishopUrl,
    king: goldWhiteKingUrl,
    knight: goldWhiteKnightUrl,
    pawn: goldWhitePawnUrl,
    queen: goldWhiteQueenUrl,
    rook: goldWhiteRookUrl,
  },
  black: {
    bishop: goldBlackBishopUrl,
    king: goldBlackKingUrl,
    knight: goldBlackKnightUrl,
    pawn: goldBlackPawnUrl,
    queen: goldBlackQueenUrl,
    rook: goldBlackRookUrl,
  },
};

const CLASSIC_PIECE_ASSETS: PieceAssetMap = {
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

const RETRO_PIECE_ASSETS: PieceAssetMap = {
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

const uniformScale = (scale: number): PieceScaleMap => ({
  bishop: scale,
  king: scale,
  knight: scale,
  pawn: scale,
  queen: scale,
  rook: scale,
});

const SVG_BOARD_SCALE = uniformScale(0.84);

const SVG_ROULETTE_SCALE: PieceScaleMap = {
  bishop: 0.76,
  king: 0.72,
  knight: 0.8,
  pawn: 0.84,
  queen: 0.72,
  rook: 0.76,
};

const GOLD_BOARD_SCALE: PieceScaleMap = {
  bishop: 1.12,
  king: 1,
  knight: 1.2,
  pawn: 1.27,
  queen: 1.05,
  rook: 1.2,
};

const GOLD_ROULETTE_SCALE: PieceScaleMap = {
  bishop: 1.22,
  king: 1.15,
  knight: 1.3,
  pawn: 1.26,
  queen: 1.16,
  rook: 1.25,
};

const GOLD_BOARD_TRANSLATE_Y: PieceScaleMap = {
  bishop: -0.04,
  king: -0.035,
  knight: -0.06,
  pawn: -0.11,
  queen: -0.035,
  rook: -0.06,
};

const GOLD_ROULETTE_TRANSLATE_Y: PieceScaleMap = {
  bishop: -0.025,
  king: -0.02,
  knight: -0.03,
  pawn: -0.03,
  queen: -0.02,
  rook: -0.035,
};

const DEFAULT_TRANSLATE_X: PieceScaleMap = {
  bishop: 0,
  king: 0,
  knight: 0.02,
  pawn: 0,
  queen: 0,
  rook: 0,
};

const DEFAULT_TRANSLATE_Y = uniformScale(0);

export const PIECE_SET_CATALOG: Readonly<
  Record<PieceSet, PieceSetDefinition>
> = {
  gold: {
    boardAssets: GOLD_PIECE_ASSETS,
    boardScale: GOLD_BOARD_SCALE,
    boardTranslateY: GOLD_BOARD_TRANSLATE_Y,
    displayName: "Gold",
    id: "gold",
    resultAssets: GOLD_PIECE_ASSETS,
    resultScale: uniformScale(1.08),
    resultTranslateY: DEFAULT_TRANSLATE_Y,
    rouletteAssets: GOLD_PIECE_ASSETS,
    rouletteScale: GOLD_ROULETTE_SCALE,
    rouletteTranslateY: GOLD_ROULETTE_TRANSLATE_Y,
    translateX: DEFAULT_TRANSLATE_X,
  },
  classic: {
    boardAssets: CLASSIC_PIECE_ASSETS,
    boardScale: SVG_BOARD_SCALE,
    boardTranslateY: DEFAULT_TRANSLATE_Y,
    displayName: "Classic",
    id: "classic",
    resultAssets: CLASSIC_PIECE_ASSETS,
    resultScale: uniformScale(1),
    resultTranslateY: DEFAULT_TRANSLATE_Y,
    rouletteAssets: CLASSIC_PIECE_ASSETS,
    rouletteScale: SVG_ROULETTE_SCALE,
    rouletteTranslateY: DEFAULT_TRANSLATE_Y,
    translateX: DEFAULT_TRANSLATE_X,
  },
  retro: {
    boardAssets: RETRO_PIECE_ASSETS,
    boardScale: SVG_BOARD_SCALE,
    boardTranslateY: DEFAULT_TRANSLATE_Y,
    displayName: "Retro",
    id: "retro",
    resultAssets: RETRO_PIECE_ASSETS,
    resultScale: uniformScale(1),
    resultTranslateY: DEFAULT_TRANSLATE_Y,
    rouletteAssets: RETRO_PIECE_ASSETS,
    rouletteScale: SVG_ROULETTE_SCALE,
    rouletteTranslateY: DEFAULT_TRANSLATE_Y,
    translateX: DEFAULT_TRANSLATE_X,
  },
};

export const SELECTABLE_PIECE_SETS: readonly PieceSetDefinition[] = [
  PIECE_SET_CATALOG.gold,
  PIECE_SET_CATALOG.classic,
  PIECE_SET_CATALOG.retro,
];

export function isPieceSet(value: unknown): value is PieceSet {
  return value === "gold" || value === "classic" || value === "retro";
}

export function normalizePieceSet(value: unknown): PieceSet {
  return isPieceSet(value) ? value : DEFAULT_PIECE_SET;
}

export function migrateLegacyPieceSet(value: unknown): PieceSet {
  if (value === "classic") {
    return "retro";
  }

  if (value === "gold") {
    return "gold";
  }

  return DEFAULT_PIECE_SET;
}

export function resolvePieceVisual({
  context,
  pieceColor,
  pieceType,
  pieceSet,
}: ResolvePieceVisualOptions): PieceVisual {
  const visualSet = normalizePieceSet(pieceSet);
  const definition = PIECE_SET_CATALOG[visualSet];
  const assetsByContext: Readonly<Record<PieceVisualContext, PieceAssetMap>> = {
    board: definition.boardAssets,
    result: definition.resultAssets,
    roulette: definition.rouletteAssets,
  };
  const scaleByContext: Readonly<Record<PieceVisualContext, PieceScaleMap>> = {
    board: definition.boardScale,
    result: definition.resultScale,
    roulette: definition.rouletteScale,
  };
  const translateYByContext: Readonly<
    Record<PieceVisualContext, PieceScaleMap>
  > = {
    board: definition.boardTranslateY,
    result: definition.resultTranslateY,
    roulette: definition.rouletteTranslateY,
  };

  return {
    fallback: PIECE_FALLBACK_LABELS[pieceType],
    kind: "image",
    label: PIECE_LABELS[pieceType],
    scale: scaleByContext[context][pieceType],
    src: assetsByContext[context][pieceColor][pieceType],
    translateX: definition.translateX[pieceType],
    translateY: translateYByContext[context][pieceType],
  };
}
