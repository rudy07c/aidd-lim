import { WorldState } from "../world";

/**
 * recoverZef (= O17): Zef: dor -> pex, no preconditions beyond fromState guard.
 */
export function recoverZef(world: WorldState): WorldState {
  if (world.zef !== "dor") {
    throw new Error("recoverZef: Zef must be in state 'dor'");
  }
  return { ...world, zef: "pex" };
}
