import { WorldState } from "../world";

/**
 * advanceOsk1 (= O6): Osk: nim -> pex, no preconditions
 */
export function advanceOsk1(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error("advanceOsk1: Osk must be in state 'nim'");
  }
  return { ...world, osk: "pex" };
}
