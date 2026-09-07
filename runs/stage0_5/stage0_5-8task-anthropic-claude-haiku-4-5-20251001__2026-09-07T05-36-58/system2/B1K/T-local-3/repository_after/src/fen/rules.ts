import { WorldState } from "../world";

/**
 * Advance Fen from nim to pex
 */
export function advanceFen1(world: WorldState): WorldState {
  if (world.fen !== "nim") {
    throw new Error("advanceFen1: Fen must be in nim state");
  }
  return { ...world, fen: "pex" };
}

/**
 * Advance Fen from pex to dor
 */
export function advanceFen2(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("advanceFen2: Fen must be in pex state");
  }
  return { ...world, fen: "dor" };
}

/**
 * Reset Fen from pex back to nim
 */
export function resetFen(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("resetFen: Fen must be in pex state");
  }
  return { ...world, fen: "nim" };
}
