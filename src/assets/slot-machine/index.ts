import bishopSymbolUrl from "./generated/bishop.png";
import kingSymbolUrl from "./generated/king.png";
import knightSymbolUrl from "./generated/knight.png";
import pawnSymbolUrl from "./generated/pawn.png";
import queenSymbolUrl from "./generated/queen.png";
import slotMachineFrameUrl from "./generated/slot-machine-frame.png";
import slotMachineLeverUrl from "./generated/slot-machine-lever.png";
import rookSymbolUrl from "./generated/rook.png";
import updateLeverGameUrl from "./generated/update-lever-game-trimmed.png";
import updateLeverUrl from "./generated/update-lever-transparent.png";
import updateMachineGameUrl from "./generated/update-machine-game-trimmed.png";
import updateMachineUrl from "./generated/update-machine-transparent.png";

export const SLOT_MACHINE_ASSETS = {
  assembly: {
    lever: updateLeverUrl,
    machine: updateMachineUrl,
  },
  gameAssembly: {
    lever: updateLeverGameUrl,
    machine: updateMachineGameUrl,
  },
  generated: {
    frame: slotMachineFrameUrl,
    lever: slotMachineLeverUrl,
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
