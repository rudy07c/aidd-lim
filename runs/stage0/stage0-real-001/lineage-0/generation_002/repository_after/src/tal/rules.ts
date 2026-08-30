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
 * kindleBoth: Zef and Tal: nim -> pex simultaneously, no preconditions
 * Advances both Zef and Tal from 'nim' to 'pex' in a single atomic operation.
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("kindleBoth: Zef must be in state 'nim'");
  }
  if (world.tal !== "nim") {
    throw new Error("kindleBoth: Tal must be in state 'nim'");
  }
  return { ...world, zef: "pex", tal: "pex" };
}
