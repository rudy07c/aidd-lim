import { WorldState } from "./world";

/**
 * kindleBoth: simultaneously advance Tal and Zef from 'nim' to 'pex'
 * Tal: nim -> pex (no preconditions)
 * Zef: nim -> pex (bypasses the normal Tal=pex requirement since both transition together)
 * This is a cross-entity operation that kindles both entities at once.
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("kindleBoth: Tal must be in state 'nim'");
  }
  if (world.zef !== "nim") {
    throw new Error("kindleBoth: Zef must be in state 'nim'");
  }
  return { ...world, tal: "pex", zef: "pex" };
}
