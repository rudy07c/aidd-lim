import { WorldState } from "./world";

/**
 * advanceOskFen: simultaneous operation for Osk: nim -> pex AND Fen: nim -> pex
 * Osk has no preconditions, but Fen requires Osk to be in 'pex' state.
 * This operation performs both transitions atomically.
 */
export function advanceOskFen(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error("advanceOskFen: Osk must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("advanceOskFen: Fen must be in state 'nim'");
  }
  return { ...world, osk: "pex", fen: "pex" };
}
