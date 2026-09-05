import { WorldState } from "../world";

/**
 * kindleBoth: Advances both Zef and Tal to 'pex' state simultaneously.
 * Both must be in 'nim' state initially.
 * No external preconditions required.
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
