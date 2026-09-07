import { WorldState } from "../world";

/**
 * kindleBoth: Simultaneously advances Tal: nim -> pex and Zef: nim -> pex
 * Tal is advanced first to satisfy Zef's precondition (requires Tal === "pex")
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("kindleBoth: Tal must be in state 'nim'");
  }
  if (world.zef !== "nim") {
    throw new Error("kindleBoth: Zef must be in state 'nim'");
  }
  // Advance Tal first, then Zef (Zef requires Tal to be 'pex')
  return { ...world, tal: "pex", zef: "pex" };
}
