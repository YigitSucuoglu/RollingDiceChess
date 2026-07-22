import type { Move } from "../types/Chess";
import type { BotMoveSelector } from "./BotMoveSelector";
import { selectRandomItem } from "./BotMoveSelector";
import type ChessBoard from "./ChessBoard";

export default class RandomMoveSelector implements BotMoveSelector {
  public selectMove(
    selectableMoves: readonly Move[],
    _board: ChessBoard,
    random: () => number
  ): Move {
    return selectRandomItem(selectableMoves, random);
  }
}
