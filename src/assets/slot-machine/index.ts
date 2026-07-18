import chessPieceSheetUrl from "./source/chess-piece-sheet.png";
import slotMachineSheetUrl from "./source/slot-machine-sheet.png";

export const SLOT_MACHINE_ASSETS = {
  sourceSheets: {
    machine: slotMachineSheetUrl,
    chessPieces: chessPieceSheetUrl,
  },
} as const;

export type SlotMachineSourceSheet =
  keyof typeof SLOT_MACHINE_ASSETS.sourceSheets;
