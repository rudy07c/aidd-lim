import { WorldState } from "../world";

/**
 * recoverFen (= O18): Fen: dor -> pex, no preconditions beyond fromState guard.
 */
export function recoverFen(world: WorldState): WorldState {
  if (world.fen !== "dor") {
    throw new Error("recoverFen: Fen must be in state 'dor'");
  }
  return { ...world, fen: "pex" };
}
