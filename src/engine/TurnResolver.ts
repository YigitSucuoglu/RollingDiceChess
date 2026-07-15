import type { Move } from "../types/Chess";
import type { SimulationState } from "./Simulation";

export interface TurnResolution {
  maxConsumableRights: number;
  selectableMoves: Move[];
}

export default class TurnResolver {
  public resolve(state: SimulationState): TurnResolution {
    void state;
    throw new Error("TurnResolver has not been implemented yet.");
  }
}
