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
} as const;
