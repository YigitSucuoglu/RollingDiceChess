import bishopSymbolUrl from "./generated/bishop.png";
import kingSymbolUrl from "./generated/king.png";
import knightSymbolUrl from "./generated/knight.png";
import pawnSymbolUrl from "./generated/pawn.png";
import queenSymbolUrl from "./generated/queen.png";
import slotMachineFrameUrl from "./generated/slot-machine-frame.png";
import rookSymbolUrl from "./generated/rook.png";

export const SLOT_MACHINE_ASSETS = {
  generated: {
    frame: slotMachineFrameUrl,
  },
  symbols: {
    pawn: pawnSymbolUrl,
    knight: knightSymbolUrl,
    bishop: bishopSymbolUrl,
    rook: rookSymbolUrl,
    queen: queenSymbolUrl,
    king: kingSymbolUrl,
  },
} as const;
