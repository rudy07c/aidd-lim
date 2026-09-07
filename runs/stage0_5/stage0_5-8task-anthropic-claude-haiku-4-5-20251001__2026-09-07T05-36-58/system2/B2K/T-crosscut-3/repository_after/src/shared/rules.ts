import { WorldState } from "../world";

/**
 * advanceOskFen: Simultaneously advance Osk and Fen from 'nim' to 'pex'
 * Osk: nim -> pex
 * Fen: nim -> pex
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
