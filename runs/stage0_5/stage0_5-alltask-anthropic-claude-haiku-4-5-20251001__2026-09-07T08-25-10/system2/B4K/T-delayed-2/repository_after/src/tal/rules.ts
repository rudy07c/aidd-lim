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
 * advanceTalOsk: Tal: nim -> pex AND Osk: nim -> pex, no preconditions
 * Atomic operation advancing both Tal and Osk simultaneously.
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