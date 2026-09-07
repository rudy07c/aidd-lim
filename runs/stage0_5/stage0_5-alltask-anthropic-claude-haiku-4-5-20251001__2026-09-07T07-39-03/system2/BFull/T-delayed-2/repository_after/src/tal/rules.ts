import { WorldState } from "../world";

/**
 * advanceTal1 (= O5): Tal: nim -> pex, no preconditions
 */
export function advanceTal1(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("advanceTal1: Tal must be in state 'nim'");
  }
  return { ...world, tal: "pex" };
}

/**
 * advanceTalOsk: Tal and Osk: nim -> pex simultaneously, no preconditions
 */
export function advanceTalOsk(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("advanceTalOsk: Tal must be in state 'nim'");
  }
  if (world.osk !== "nim") {
    throw new Error("advanceTalOsk: Osk must be in state 'nim'");
  }
  return { ...world, tal: "pex", osk: "pex" };
}
