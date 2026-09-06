import { WorldState } from "../world";

/**
 * recoverVok (= O16): Vok: dor -> pex, no preconditions beyond fromState guard.
 */
export function recoverVok(world: WorldState): WorldState {
  if (world.vok !== "dor") {
    throw new Error("recoverVok: Vok must be in state 'dor'");
  }
  return { ...world, vok: "pex" };
}
