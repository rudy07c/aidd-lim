import { WorldState } from "../world";

/**
 * kindleBoth: Advances both Zef and Tal from 'nim' to 'pex' simultaneously.
 * Combines the functionality of advanceTal1 and advanceZef1.
 */
export function kindleBoth(world: WorldState): WorldState {
  // Both Zef and Tal must be in 'nim' state
  if (world.zef !== "nim") {
    throw new Error("kindleBoth: Zef must be in state 'nim'");
  }
  if (world.tal !== "nim") {
    throw new Error("kindleBoth: Tal must be in state 'nim'");
  }
  // Advance both to 'pex'
  return { ...world, zef: "pex", tal: "pex" };
}
