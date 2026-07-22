import type { Move } from "../types/Chess";
import type ChessBoard from "./ChessBoard";

export interface BotMoveSelector {
  selectMove(
    selectableMoves: readonly Move[],
    board: ChessBoard,
    random: () => number
  ): Move;
}

export function selectRandomItem<T>(
  items: readonly T[],
  random: () => number
): T {
  if (items.length === 0) {
    throw new RangeError("Cannot select from an empty list.");
  }

  const randomValue = random();

  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("Bot random source must return a value in [0, 1).");
  }

  return items[Math.floor(randomValue * items.length)];
}
