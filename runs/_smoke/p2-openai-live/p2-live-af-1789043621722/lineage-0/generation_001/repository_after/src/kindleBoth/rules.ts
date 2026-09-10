import { WorldState } from "../world";

/**
 * kindleBoth: atomically advances Zef and Tal from nim to pex.
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
