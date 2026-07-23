import type { PieceColor } from "../types/Chess";
import type { TurnSequence } from "./TurnSequenceGenerator";

export interface TurnSequenceSelector {
  selectSequence(
    sequences: readonly TurnSequence[],
    botColor: PieceColor,
    random: () => number
  ): TurnSequence;
}
