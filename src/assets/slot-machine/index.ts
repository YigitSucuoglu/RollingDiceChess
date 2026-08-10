import updateLeverGameUrl from "./runtime/game-lever.webp";
import updateMachineGameUrl from "./runtime/game-machine.webp";

export const SLOT_MACHINE_ASSETS = {
  gameAssembly: {
    lever: updateLeverGameUrl,
    machine: updateMachineGameUrl,
  },
} as const;
