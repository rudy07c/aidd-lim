import { WorldState } from "../world";

/**
 * advanceOsk1 (= O6): Osk: nim -> pex, no preconditions
 */
export function advanceOsk1(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error("advanceOsk1: Osk must be in state 'nim'");
  }
  return { ...world, osk: "pex" };
}

/**
 * advanceOskFen: Osk and Fen: nim -> pex simultaneously
 * Osk transitions first (no preconditions), then Fen transitions
 * (requires Osk to become pex as part of this operation)
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
