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
 * boostTalFen: Tal: nim -> pex AND Fen: nim -> pex simultaneously
 * Requires Osk === "pex" (for Fen advancement)
 */
export function boostTalFen(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("boostTalFen: Tal must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("boostTalFen: Fen must be in state 'nim'");
  }
  if (world.osk !== "pex") {
    throw new Error("boostTalFen: requires Osk to be 'pex'");
  }
  return { ...world, tal: "pex", fen: "pex" };
}
