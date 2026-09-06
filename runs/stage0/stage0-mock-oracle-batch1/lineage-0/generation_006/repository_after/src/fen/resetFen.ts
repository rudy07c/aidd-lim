import { WorldState } from "../world";

/**
 * resetFen (= O15): Fen: pex -> nim, no preconditions beyond fromState guard.
 */
export function resetFen(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("resetFen: Fen must be in state 'pex'");
  }
  return { ...world, fen: "nim" };
}
