import { WorldState } from "../world";

/**
 * advanceOsk1 (= O6): Osk: nim -> pex
 * No dependencies for this operation.
 */
export function advanceOsk1(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error("advanceOsk1: Osk must be in state 'nim'");
  }
  return { ...world, osk: "pex" };
}

/**
 * advanceOskFen: Osk: nim -> pex AND Fen: nim -> pex simultaneously.
 * Requires both Osk and Fen to be in state 'nim'.
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
